"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { parseDecimal } from "@/lib/format";
import { geocodeAddress } from "@/lib/geo/nominatim";
import { facilityAddress } from "@/lib/parking/validation";
import type { PartyFormState } from "@/lib/parties/form-state";
import {
  checkDuplicates,
  getContact,
  getLocation,
  getParty,
  listDataSources,
  listLocations,
} from "@/lib/parties/queries";
import {
  CONTACT_FIELDS,
  LOCATION_FIELDS,
  PARTY_FIELDS,
  PARTY_TRACKED_FIELDS,
  readProvenance,
  readRaw,
  validateContact,
  validateParty,
  type ProvenanceInput,
  type TrackedField,
} from "@/lib/parties/validation";
import { readPipelineEntry } from "@/lib/pipeline/entry";
import { isOppositionChannel } from "@/lib/suppression/labels";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;
const SAVE_FAILED = "Salvataggio non riuscito. Riprova; se il problema continua, avvisa l'amministratore.";
const NOT_ALLOWED = "Non hai i permessi per questa operazione.";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function writeError(error: { code?: string; message?: string }): { message: string; fieldErrors?: Record<string, string> } {
  if (error.code === "42501") return { message: NOT_ALLOWED };
  if (error.code === "23505" && error.message?.includes("piva")) {
    return { message: "Esiste già un soggetto con questa partita IVA.", fieldErrors: { piva: "Partita IVA già presente." } };
  }
  if (error.code === "23514" && error.message?.includes("email")) {
    return { message: "Controlla i campi evidenziati.", fieldErrors: { email: "Indirizzo email non valido." } };
  }
  return { message: SAVE_FAILED };
}

// Writes provenance rows for the tracked fields whose value changed.
async function saveProvenance(entita: "parties" | "contacts", entitaId: string, rows: ProvenanceInput[]) {
  if (rows.length === 0) return null;
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("field_provenance").upsert(
    rows.map((row) => ({
      entita,
      entita_id: entitaId,
      campo: row.campo,
      stato: row.stato,
      fonte_id: row.fonteId,
      acquisito_il: now,
      verificato_il: row.stato === "verificato" ? now : null,
    })),
    { onConflict: "entita,entita_id,campo" },
  );
  return error;
}

// ---------------------------------------------------------------------------
// Party
// ---------------------------------------------------------------------------

export async function saveParty(previous: PartyFormState, form: FormData): Promise<PartyFormState> {
  const version = previous.version + 1;
  const raw = readRaw(form, PARTY_FIELDS);
  if (!(await getCurrentUser())) return { version, status: "error", message: NOT_ALLOWED, values: raw };

  const id = field(form, "id");
  const existing = id ? await getParty(id) : null;
  if (id && (!existing || existing.merged_into_id)) {
    return { version, status: "error", message: "Soggetto non trovato.", values: raw };
  }

  const { values, location, errors } = validateParty(form);
  // Car park of interest: new parties only.
  const pipeline = existing ? { entry: null, errors: {} } : readPipelineEntry(raw);
  if (!values || Object.keys(pipeline.errors).length > 0) {
    return { version, status: "error", message: "Controlla i campi evidenziati.", fieldErrors: { ...errors, ...pipeline.errors }, values: raw };
  }

  // Duplicate check, always in the database (public.check_party_duplicates).
  const mainLocation = existing ? (await listLocations(existing.id)).find((row) => row.principale) : undefined;
  const duplicates = await checkDuplicates({
    partyId: existing?.id,
    ...values,
    cap: location.cap ?? mainLocation?.cap,
    citta: location.citta ?? mainLocation?.citta,
  });
  if (duplicates.some((match) => match.livello === "blocco")) {
    return {
      version,
      status: "duplicate-block",
      values: raw,
      duplicates: duplicates.filter((match) => match.livello === "blocco"),
    };
  }
  if (duplicates.length > 0 && field(form, "ignora_avvisi") !== "1") {
    return { version, status: "duplicate-warning", values: raw, duplicates };
  }

  const supabase = await createClient();
  let partyId = id;
  if (existing) {
    const { data, error } = await supabase.from("parties").update(values).eq("id", id).select("id");
    if (error) return { version, status: "error", values: raw, ...writeError(error) };
    if (data.length === 0) return { version, status: "error", message: NOT_ALLOWED, values: raw };
  } else {
    const { data, error } = await supabase.from("parties").insert(values).select("id").single();
    if (error) return { version, status: "error", values: raw, ...writeError(error) };
    partyId = data.id;
    if (location.indirizzo || location.cap || location.citta) {
      const { error: locationError } = await supabase
        .from("party_locations")
        .insert({ party_id: partyId, ...location, principale: true });
      if (locationError) return { version, status: "error", message: SAVE_FAILED, values: raw };
    }
    if (pipeline.entry) {
      const { error: entryError } = await supabase.rpc("add_to_parking", {
        p_parties: [partyId],
        p_parking: pipeline.entry.parkingId,
        p_fase: pipeline.entry.fase,
        p_origine: pipeline.entry.origine ?? undefined,
      });
      if (entryError) return { version, status: "error", message: SAVE_FAILED, values: raw };
    }
  }

  // Provenance of the tracked fields that changed (and have a value).
  const sourceIds = new Set((await listDataSources()).map((source) => source.id));
  const changed = PARTY_TRACKED_FIELDS.filter((name) => {
    const next = values[name];
    const before = existing ? existing[name] : null;
    const hasValue = next !== null && next !== "non_noto";
    return hasValue && String(next) !== String(before ?? "");
  });
  const provenanceError = await saveProvenance(
    "parties",
    partyId,
    changed.map((name) => readProvenance(form, name, sourceIds)),
  );
  if (provenanceError) return { version, status: "error", message: SAVE_FAILED, values: raw };

  revalidatePath("/soggetti");
  redirect(`/soggetti/${partyId}`);
}

// ---------------------------------------------------------------------------
// Location (address, main flag, Nominatim geocoding)
// ---------------------------------------------------------------------------

export async function saveLocation(previous: PartyFormState, form: FormData): Promise<PartyFormState> {
  const version = previous.version + 1;
  const raw = readRaw(form, LOCATION_FIELDS);
  if (!(await getCurrentUser())) return { version, status: "error", message: NOT_ALLOWED, values: raw };

  const partyId = field(form, "party_id");
  const locationId = field(form, "id");
  const party = partyId ? await getParty(partyId) : null;
  if (!party || party.merged_into_id) return { version, status: "error", message: "Soggetto non trovato.", values: raw };
  const existing = locationId ? await getLocation(partyId, locationId) : null;
  if (locationId && !existing) return { version, status: "error", message: "Sede non trovata.", values: raw };

  const errors: Record<string, string> = {};
  if (raw.indirizzo === "" && raw.citta === "") errors.indirizzo = "Inserisci almeno l'indirizzo o la città.";
  if (raw.cap !== "" && !/^\d{5}$/.test(raw.cap)) errors.cap = "Il CAP ha 5 cifre.";
  let lat = parseDecimal(raw.lat);
  let lng = parseDecimal(raw.lng);
  if (lat !== null && (Number.isNaN(lat) || Math.abs(lat) > 90)) errors.lat = "Latitudine tra -90 e 90.";
  if (lng !== null && (Number.isNaN(lng) || Math.abs(lng) > 180)) errors.lng = "Longitudine tra -180 e 180.";
  if (!errors.lat && !errors.lng && (lat === null) !== (lng === null)) {
    errors[lat === null ? "lat" : "lng"] = "Inserisci sia la latitudine sia la longitudine, oppure nessuna delle due.";
  }
  if (Object.keys(errors).length > 0) {
    return { version, status: "error", message: "Controlla i campi evidenziati.", fieldErrors: errors, values: raw };
  }

  const address = { indirizzo: raw.indirizzo || null, cap: raw.cap || null, citta: raw.citta || null };
  const decision = field(form, "geo");
  let source: "nominatim" | "manuale" | null = null;
  if (decision === "accept") {
    lat = parseDecimal(field(form, "geo_lat"));
    lng = parseDecimal(field(form, "geo_lng"));
    if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) {
      return { version, status: "error", message: "Coordinate proposte non valide: riprova.", values: raw };
    }
    source = "nominatim";
  } else {
    const text = facilityAddress(address);
    const changedAddress = !existing || text !== facilityAddress(existing);
    if (decision !== "skip" && changedAddress && text !== "") {
      const result = await geocodeAddress(text);
      if (result.kind === "found") {
        return {
          version,
          status: "confirm-geocode",
          values: raw,
          geocode: { formattedAddress: result.formattedAddress, lat: result.lat, lng: result.lng },
        };
      }
      return {
        version,
        status: "geocode-failed",
        message:
          result.kind === "not-found"
            ? "OpenStreetMap non ha trovato questo indirizzo. Controllalo, oppure inserisci latitudine e longitudine a mano e salva."
            : "La ricerca delle coordinate non è riuscita. Inserisci latitudine e longitudine a mano e salva.",
        values: raw,
      };
    }
    if ((!existing || lat !== existing.lat || lng !== existing.lng) && lat !== null) source = "manuale";
  }

  const principale = raw.principale === "on";
  const coordinatesCleared = existing !== null && existing.lat !== null && lat === null;
  const record = {
    ...address,
    lat,
    lng,
    principale,
    ...(source || coordinatesCleared
      ? { coordinate_fonte: source, coordinate_aggiornate_il: source ? new Date().toISOString() : null }
      : {}),
  };

  const supabase = await createClient();
  // One main location per party (unique index): clear the others first.
  if (principale) {
    const { error } = await supabase
      .from("party_locations")
      .update({ principale: false })
      .eq("party_id", partyId)
      .neq("id", locationId || "00000000-0000-0000-0000-000000000000");
    if (error) return { version, status: "error", values: raw, ...writeError(error) };
  }
  const { error } = existing
    ? await supabase.from("party_locations").update(record).eq("id", locationId)
    : await supabase.from("party_locations").insert({ ...record, party_id: partyId });
  if (error) return { version, status: "error", values: raw, ...writeError(error) };

  revalidatePath(`/soggetti/${partyId}`);
  redirect(`/soggetti/${partyId}#sedi`);
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

export async function saveContact(previous: PartyFormState, form: FormData): Promise<PartyFormState> {
  const version = previous.version + 1;
  const raw = readRaw(form, CONTACT_FIELDS);
  if (!(await getCurrentUser())) return { version, status: "error", message: NOT_ALLOWED, values: raw };

  const partyId = field(form, "party_id");
  const contactId = field(form, "id");
  const party = partyId ? await getParty(partyId) : null;
  if (!party || party.merged_into_id) return { version, status: "error", message: "Soggetto non trovato.", values: raw };
  const existing = contactId ? await getContact(partyId, contactId) : null;
  if (contactId && !existing) return { version, status: "error", message: "Contatto non trovato.", values: raw };

  const { values, errors } = validateContact(form);
  if (!values) {
    return { version, status: "error", message: "Controlla i campi evidenziati.", fieldErrors: errors, values: raw };
  }

  const supabase = await createClient();
  let savedId = contactId;
  if (existing) {
    const { error } = await supabase.from("contacts").update(values).eq("id", contactId);
    if (error) return { version, status: "error", values: raw, ...writeError(error) };
  } else {
    const { data, error } = await supabase
      .from("contacts")
      .insert({ ...values, party_id: partyId })
      .select("id")
      .single();
    if (error) return { version, status: "error", values: raw, ...writeError(error) };
    savedId = data.id;
  }

  // "Referente" provenance: the person's name and role.
  const identity = (row: { nome: string | null; cognome: string | null; ruolo: string | null } | null) =>
    row ? [row.nome, row.cognome, row.ruolo].join("|") : "";
  if (identity(values) !== identity(existing)) {
    const sourceIds = new Set((await listDataSources()).map((source) => source.id));
    const provenanceError = await saveProvenance("contacts", savedId, [
      readProvenance(form, "referente" satisfies TrackedField, sourceIds),
    ]);
    if (provenanceError) return { version, status: "error", message: SAVE_FAILED, values: raw };
  }

  revalidatePath(`/soggetti/${partyId}`);
  redirect(`/soggetti/${partyId}#contatti`);
}

// ---------------------------------------------------------------------------
// Do not contact
// ---------------------------------------------------------------------------

export async function markDoNotContact(
  entita: "parties" | "contacts",
  id: string,
  partyId: string,
  motivo: string,
  canale: string,
): Promise<{ ok: boolean; message?: string; closed?: number }> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (motivo.trim() === "") return { ok: false, message: "Scrivi il motivo." };
  if (!isOppositionChannel(canale)) return { ok: false, message: "Indica da dove arriva la richiesta." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_do_not_contact", {
    p_entita: entita,
    p_id: id,
    p_motivo: motivo.trim().slice(0, 1000),
    p_canale: canale,
  });
  if (error) return { ok: false, message: error.code === "42501" ? NOT_ALLOWED : SAVE_FAILED };
  revalidatePath(`/soggetti/${partyId}`);
  revalidatePath("/soggetti");
  revalidatePath("/pipeline");
  revalidatePath("/oggi");
  revalidatePath("/esclusioni");
  return { ok: true, closed: Number((data as { opportunita_chiuse?: number } | null)?.opportunita_chiuse ?? 0) };
}

export async function clearDoNotContact(
  entita: "parties" | "contacts",
  id: string,
  partyId: string,
): Promise<{ ok: boolean; message?: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { ok: false, message: "Solo l'amministratore può togliere “Non contattare”." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("clear_do_not_contact", { p_entita: entita, p_id: id });
  if (error) return { ok: false, message: error.code === "42501" ? NOT_ALLOWED : SAVE_FAILED };
  revalidatePath(`/soggetti/${partyId}`);
  revalidatePath("/soggetti");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

export async function mergeParties(
  keepId: string,
  dropId: string,
  values: Record<string, unknown>,
): Promise<{ ok: boolean; message?: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { ok: false, message: "Solo l'amministratore può unire due soggetti." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_parties", {
    p_keep: keepId,
    p_drop: dropId,
    p_values: values as never,
  });
  if (error) {
    if (error.code === "42501") return { ok: false, message: NOT_ALLOWED };
    if (error.code === "23505") {
      return { ok: false, message: "I due soggetti hanno un'opportunità aperta sullo stesso parcheggio: chiudine una prima di unirli." };
    }
    return { ok: false, message: "Unione non riuscita: nessuna modifica è stata salvata. Riprova." };
  }
  revalidatePath("/soggetti");
  revalidatePath(`/soggetti/${keepId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Delete a party (A4, administrators only; not the GDPR erasure)
// ---------------------------------------------------------------------------

export type DeleteSummary = { sedi: number; contatti: number; opportunita: number; attivita: number; offerte: number; uniti: number };

function readSummary(data: unknown): DeleteSummary {
  const raw = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const n = (key: string) => (typeof raw[key] === "number" ? (raw[key] as number) : 0);
  return { sedi: n("sedi"), contatti: n("contatti"), opportunita: n("opportunita"), attivita: n("attivita"), offerte: n("offerte"), uniti: n("uniti") };
}

export async function partyDeleteSummary(partyId: string): Promise<{ ok: true; data: DeleteSummary } | { ok: false; message: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { ok: false, message: "Solo l'amministratore può eliminare un soggetto." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("party_delete_summary", { p_party: partyId });
  if (error) return { ok: false, message: "Riepilogo non disponibile. Riprova." };
  return { ok: true, data: readSummary(data) };
}

export async function deleteParty(partyId: string): Promise<{ ok: true; data: DeleteSummary } | { ok: false; message: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { ok: false, message: "Solo l'amministratore può eliminare un soggetto." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_party", { p_party: partyId });
  if (error) {
    return {
      ok: false,
      message:
        error.code === "42501"
          ? "Solo l'amministratore può eliminare un soggetto."
          : error.code === "23503"
            ? "Il soggetto ha un'offerta già passata al backoffice: non si può eliminare."
            : "Eliminazione non riuscita: nessun dato è stato cancellato. Riprova.",
    };
  }
  revalidatePath("/soggetti");
  revalidatePath("/pipeline");
  return { ok: true, data: readSummary(data) };
}

// ---------------------------------------------------------------------------
// GDPR erasure (CRM-31, administrators)
// ---------------------------------------------------------------------------

export type GdprResult = { soggetti: number; contatti: number; sedi: number; opportunita: number; email: number; valori_in_esclusione: number };

export async function gdprErase(
  entita: "parties" | "contacts",
  id: string,
  partyId: string,
): Promise<{ ok: true; data: GdprResult } | { ok: false; message: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { ok: false, message: "Solo l'amministratore può cancellare per richiesta GDPR." };
  if ((entita !== "parties" && entita !== "contacts") || !UUID_PATTERN.test(id)) return { ok: false, message: "Record non trovato." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gdpr_erase", { p_entita: entita, p_id: id });
  if (error) return { ok: false, message: error.code === "42501" ? NOT_ALLOWED : error.code === "P0002" ? "Record non trovato." : SAVE_FAILED };
  revalidatePath(`/soggetti/${partyId}`);
  revalidatePath("/soggetti");
  revalidatePath("/pipeline");
  revalidatePath("/oggi");
  revalidatePath("/esclusioni");
  return { ok: true, data: data as GdprResult };
}

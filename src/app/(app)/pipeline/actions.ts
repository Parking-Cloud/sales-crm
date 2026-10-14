"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { romeInstant } from "@/lib/pipeline/dates";
import { ENTRY_STAGES, ORIGINS, type EntryStage, type Origin } from "@/lib/pipeline/entry";
import {
  ACTIVITY_TYPES,
  CALL_OUTCOMES,
  LOSS_REASONS,
  isManualStage,
  type ActivityKind,
  type CallOutcome,
  type LossReasonKey,
  type Stage,
} from "@/lib/pipeline/labels";
import { stopwatch } from "@/lib/server-timing";
import { createClient } from "@/lib/supabase/server";

// Pipeline, activities and reminders (CRM-16…CRM-20). Every active user
// creates and changes opportunities and activities of everyone (small
// team); deletions are for administrators (RLS). The database enforces the
// rules again: stages of the handoff, reason of a loss, one open
// opportunity per party and car park, "richiamare" with a date.

type Result<T = null> = { ok: true; data: T } | { ok: false; message: string };

const UUID = /^[0-9a-f-]{36}$/i;
const NOT_ALLOWED = "Non hai i permessi per questa operazione.";
const SAVE_FAILED = "Salvataggio non riuscito. Riprova.";

function refresh(opportunityId?: string | null, partyId?: string | null) {
  revalidatePath("/pipeline");
  revalidatePath("/oggi");
  if (opportunityId) revalidatePath(`/opportunita/${opportunityId}`);
  if (partyId) revalidatePath(`/soggetti/${partyId}`);
}

function dbMessage(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return error.message?.includes("handoff") ? "Questa fase arriva con il passaggio al backoffice (fase 1b)." : NOT_ALLOWED;
  if (error.code === "23505") return "Il soggetto ha già un'opportunità aperta su questo parcheggio: non se ne possono avere due.";
  if (error.code === "23514") {
    if (error.message?.includes("altro")) return "Con il motivo \"Altro\" scrivi una nota.";
    if (error.message?.includes("richiamare")) return "Con \"Richiamare\" indica la data della prossima attività.";
    if (error.message?.includes("lost_needs_reason")) return "Scegli il motivo della perdita.";
  }
  return SAVE_FAILED;
}

async function partyOf(opportunityId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("opportunities").select("party_id").eq("id", opportunityId).maybeSingle();
  return data?.party_id ?? null;
}

// ---------------------------------------------------------------------------
// Entry: parties added to a car park (block 1a-7, part A)
// ---------------------------------------------------------------------------

export type AddToParkingRow = { partyId: string; esito: "creata" | "saltata"; opportunityId: string | null; motivo: string | null };

const MAX_PARTIES = 200;

export async function addToParking(input: {
  partyIds: string[];
  parkingId: string;
  fase?: EntryStage;
  origine?: Origin | null;
}): Promise<Result<AddToParkingRow[]>> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  const partyIds = [...new Set((input?.partyIds ?? []).filter((id) => typeof id === "string" && UUID.test(id)))];
  if (partyIds.length === 0) return { ok: false, message: "Scegli almeno un soggetto." };
  if (partyIds.length > MAX_PARTIES) return { ok: false, message: `Al massimo ${MAX_PARTIES} soggetti alla volta.` };
  if (!UUID.test(input.parkingId ?? "")) return { ok: false, message: "Scegli un parcheggio." };
  const fase = input.fase && (ENTRY_STAGES as readonly string[]).includes(input.fase) ? input.fase : "individuata";
  const origine = input.origine && (ORIGINS as readonly string[]).includes(input.origine) ? input.origine : undefined;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_to_parking", { p_parties: partyIds, p_parking: input.parkingId, p_fase: fase, p_origine: origine });
  if (error) return { ok: false, message: error.code === "P0002" ? "Parcheggio non trovato o archiviato." : dbMessage(error) };
  const rows = (data ?? []).map((row) => ({
    partyId: row.party_id,
    esito: row.esito === "creata" ? ("creata" as const) : ("saltata" as const),
    opportunityId: row.opportunity_id,
    motivo: row.motivo,
  }));
  revalidatePath("/pipeline");
  revalidatePath("/soggetti");
  partyIds.forEach((id) => revalidatePath(`/soggetti/${id}`));
  return { ok: true, data: rows };
}

// ---------------------------------------------------------------------------
// Stage and outcome
// ---------------------------------------------------------------------------

export async function moveStage(opportunityId: string, fase: Stage): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (!UUID.test(opportunityId)) return { ok: false, message: "Opportunità non trovata." };
  if (!isManualStage(fase)) return { ok: false, message: "Questa fase arriva con il passaggio al backoffice (fase 1b)." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({ fase })
    .eq("id", opportunityId)
    .eq("esito", "aperta")
    .select("party_id");
  if (error) return { ok: false, message: dbMessage(error) };
  if (!data || data.length === 0) return { ok: false, message: "Opportunità non trovata o già chiusa: riaprila per cambiare fase." };
  refresh(opportunityId, data[0].party_id);
  return { ok: true, data: null };
}

export async function closeLost(input: {
  opportunityId: string;
  motivo: string;
  prezzoConcorrente: string;
  nota: string;
}): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (!UUID.test(input?.opportunityId ?? "")) return { ok: false, message: "Opportunità non trovata." };
  if (!(LOSS_REASONS as readonly string[]).includes(input.motivo)) return { ok: false, message: "Scegli il motivo della perdita." };
  const nota = (input.nota ?? "").trim().slice(0, 2000);
  if (input.motivo === "altro" && !nota) return { ok: false, message: "Con il motivo \"Altro\" scrivi una nota." };
  const rawPrice = (input.prezzoConcorrente ?? "").replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  const price = rawPrice === "" ? null : Number(rawPrice);
  if (price !== null && (!Number.isFinite(price) || price < 0 || price > 100000)) {
    return { ok: false, message: "Il prezzo del concorrente va scritto come numero, per esempio 120 o 95,50." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({ esito: "persa", motivo_perdita: input.motivo as LossReasonKey, prezzo_concorrente: price, nota_perdita: nota || null })
    .eq("id", input.opportunityId)
    .eq("esito", "aperta")
    .select("party_id");
  if (error) return { ok: false, message: dbMessage(error) };
  if (!data || data.length === 0) return { ok: false, message: "Opportunità non trovata o già chiusa." };
  refresh(input.opportunityId, data[0].party_id);
  return { ok: true, data: null };
}

export async function reopen(opportunityId: string): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (!UUID.test(opportunityId)) return { ok: false, message: "Opportunità non trovata." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({ esito: "aperta" })
    .eq("id", opportunityId)
    .neq("esito", "aperta")
    .select("party_id");
  if (error) return { ok: false, message: dbMessage(error) };
  if (!data || data.length === 0) return { ok: false, message: "Opportunità non trovata o già aperta." };
  refresh(opportunityId, data[0].party_id);
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Activities and reminders
// ---------------------------------------------------------------------------

export type ActivityInput = {
  opportunityId: string | null;
  partyId: string | null;
  tipo: ActivityKind;
  esito: CallOutcome | null;
  testo: string;
  // Next activity: Rome local date and time ("2026-10-20", "09:00").
  prossimaGiorno: string;
  prossimaOra: string;
  prossimaTipo: ActivityKind;
  // "Ha chiesto di ricevere l'email" (block 1a-7, B4): with "risposto" the
  // email permission is registered too, for the contact (null: the party's
  // own address), with the address when it was missing.
  permesso?: { contactId: string | null; email: string } | null;
};

export type ActivityResult = {
  proponiContattata: boolean;
  // Party of the activity, for the "Prepara email" link.
  partyId: string | null;
  permesso: { registrato: true; contactId: string | null } | { registrato: false; messaggio: string } | null;
};

function nextInstant(day: string, time: string): Date | null | "invalid" {
  if (!day) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || (time && !/^\d{2}:\d{2}$/.test(time))) return "invalid";
  return romeInstant(day, time || "09:00");
}

export async function logActivity(input: ActivityInput): Promise<Result<ActivityResult>> {
  const time = stopwatch("pipeline.attivita");
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  const opportunityId = input?.opportunityId && UUID.test(input.opportunityId) ? input.opportunityId : null;
  const partyId = input?.partyId && UUID.test(input.partyId) ? input.partyId : null;
  if (!opportunityId && !partyId) return { ok: false, message: "Opportunità o soggetto non trovati." };
  if (!(ACTIVITY_TYPES as readonly string[]).includes(input.tipo)) return { ok: false, message: "Tipo di attività non valido." };
  const esito = input.tipo === "chiamata" && (CALL_OUTCOMES as readonly string[]).includes(input.esito ?? "") ? input.esito : null;
  if (input.tipo === "chiamata" && !esito) return { ok: false, message: "Scegli l'esito della chiamata." };
  const next = nextInstant(input.prossimaGiorno ?? "", input.prossimaOra ?? "");
  if (next === "invalid") return { ok: false, message: "Data della prossima attività non valida." };
  if (esito === "richiamare" && !next) return { ok: false, message: "Con \"Richiamare\" indica quando richiamare." };
  const prossimaTipo = (ACTIVITY_TYPES as readonly string[]).includes(input.prossimaTipo) ? input.prossimaTipo : "chiamata";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_activity", {
    // One of the two is null: the function takes either.
    p_opportunity: opportunityId as string,
    p_party: partyId as string,
    p_tipo: input.tipo,
    p_esito: esito ?? undefined,
    p_testo: (input.testo ?? "").trim().slice(0, 4000) || undefined,
    p_prossima_il: next ? next.toISOString() : undefined,
    p_prossima_tipo: prossimaTipo,
  });
  time.log({ chiamata: input.tipo === "chiamata" ? 1 : 0, prossima: next ? 1 : 0, errore: error ? 1 : 0 });
  if (error) return { ok: false, message: dbMessage(error) };
  const party = partyId ?? (opportunityId ? await partyOf(opportunityId) : null);

  let permesso: ActivityResult["permesso"] = null;
  const asked = esito === "risposto" ? input.permesso : null;
  if (asked && party && (asked.contactId === null || UUID.test(asked.contactId))) {
    const { error: permissionError } = await supabase.rpc("register_email_permission", {
      // One of the two: the contact, or the party's own address.
      p_contact: asked.contactId as string,
      p_party: (asked.contactId ? null : party) as string,
      p_base: "richiesta_in_chiamata",
      p_fonte: "Chiamata",
      p_email: asked.email?.trim().slice(0, 254) || undefined,
    });
    permesso = permissionError
      ? {
          registrato: false,
          messaggio:
            permissionError.code === "42501"
              ? "Permesso email non registrato: contatto da non contattare o in lista di esclusione."
              : permissionError.message?.includes("email")
                ? "Permesso email non registrato: indirizzo mancante o non valido."
                : "Permesso email non registrato. Riprova dalla scheda del soggetto.",
        }
      : { registrato: true, contactId: asked.contactId };
  }
  refresh(opportunityId, party);
  return {
    ok: true,
    data: { proponiContattata: Boolean((data as { proponi_contattata?: boolean } | null)?.proponi_contattata), partyId: party, permesso },
  };
}

export async function completeTask(input: {
  taskId: string;
  esito: CallOutcome | null;
  testo: string;
  prossimaGiorno: string;
  prossimaOra: string;
}): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (!UUID.test(input?.taskId ?? "")) return { ok: false, message: "Promemoria non trovato." };
  const esito = (CALL_OUTCOMES as readonly string[]).includes(input.esito ?? "") ? input.esito : null;
  const next = nextInstant(input.prossimaGiorno ?? "", input.prossimaOra ?? "");
  if (next === "invalid") return { ok: false, message: "Data della prossima attività non valida." };
  if (esito === "richiamare" && !next) return { ok: false, message: "Con \"Richiamare\" indica quando richiamare." };
  const supabase = await createClient();
  const { data: task } = await supabase.from("tasks").select("tipo, opportunity_id, party_id").eq("id", input.taskId).maybeSingle();
  if (!task) return { ok: false, message: "Promemoria non trovato." };
  if (task.tipo === "chiamata" && !esito) return { ok: false, message: "Scegli l'esito della chiamata." };
  const { error } = await supabase.rpc("complete_task", {
    p_task: input.taskId,
    p_esito: esito ?? undefined,
    p_testo: (input.testo ?? "").trim().slice(0, 4000) || undefined,
    p_prossima_il: next ? next.toISOString() : undefined,
  });
  if (error) return { ok: false, message: dbMessage(error) };
  refresh(task.opportunity_id, task.party_id);
  return { ok: true, data: null };
}

export async function postponeTask(input: { taskId: string; giorno: string; ora: string }): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (!UUID.test(input?.taskId ?? "")) return { ok: false, message: "Promemoria non trovato." };
  const next = nextInstant(input.giorno ?? "", input.ora ?? "");
  if (!next || next === "invalid") return { ok: false, message: "Scegli la nuova data." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ scadenza: next.toISOString() })
    .eq("id", input.taskId)
    .is("completata_il", null)
    .select("opportunity_id, party_id");
  if (error) return { ok: false, message: dbMessage(error) };
  if (!data || data.length === 0) return { ok: false, message: "Promemoria non trovato o già fatto." };
  refresh(data[0].opportunity_id, data[0].party_id);
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Opportunity fields (B6)
// ---------------------------------------------------------------------------

export async function updateOpportunity(input: {
  opportunityId: string;
  responsabileId: string;
  contactId: string;
  prodottoId: string;
  postiRichiesti: string;
  valoreMensile: string;
}): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (!UUID.test(input?.opportunityId ?? "")) return { ok: false, message: "Opportunità non trovata." };
  const id = (value: string) => (value && UUID.test(value) ? value : null);
  const posti = input.postiRichiesti.trim() === "" ? null : Number(input.postiRichiesti);
  if (posti !== null && (!Number.isInteger(posti) || posti < 0 || posti > 100000)) return { ok: false, message: "Posti richiesti: un numero intero." };
  const rawValue = input.valoreMensile.replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  const valore = rawValue === "" ? null : Number(rawValue);
  if (valore !== null && (!Number.isFinite(valore) || valore < 0 || valore > 10_000_000)) {
    return { ok: false, message: "Valore mensile: un numero, per esempio 450 o 1.200,50." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({
      responsabile_id: id(input.responsabileId),
      contact_id: id(input.contactId),
      prodotto_interesse_id: id(input.prodottoId),
      posti_richiesti: posti,
      valore_mensile_stimato: valore,
    })
    .eq("id", input.opportunityId)
    .select("party_id");
  if (error) return { ok: false, message: dbMessage(error) };
  if (!data || data.length === 0) return { ok: false, message: "Opportunità non trovata." };
  refresh(input.opportunityId, data[0].party_id);
  return { ok: true, data: null };
}

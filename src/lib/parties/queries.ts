import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import { isOneOf } from "@/lib/parking/labels";
import type { Outcome, Stage } from "@/lib/pipeline/labels";
import { PARTY_TYPE_LABELS, isPartyCategory, type PartyCategory, type PartyType } from "./labels";

// Reads for the party screens, with the signed-in user's session (RLS).

export const PAGE_SIZE = 50;

export type PartyFilters = {
  q: string;
  tipo: PartyType | null;
  categoria: PartyCategory | null;
  citta: string;
  soloDaVerificare: boolean;
  // Car parks (ids) of the party's opportunities; "nessuno" = no car park.
  parcheggi: string[];
  senzaParcheggio: boolean;
  ordina: "parcheggio" | "parcheggio_desc" | null;
  page: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function list(value: string | string[] | undefined): string[] {
  return (Array.isArray(value) ? value : value ? [value] : []).map((item) => item.trim()).filter(Boolean);
}

export function readPartyFilters(params: Record<string, string | string[] | undefined>): PartyFilters {
  const text = (name: string) => (typeof params[name] === "string" ? (params[name] as string).trim().slice(0, 120) : "");
  const page = Number.parseInt(text("pagina"), 10);
  return {
    q: text("q"),
    tipo: isOneOf(PARTY_TYPE_LABELS, params.tipo) ? (params.tipo as PartyType) : null,
    categoria: isPartyCategory(params.categoria) ? params.categoria : null,
    citta: text("citta"),
    soloDaVerificare: params.da_verificare === "1",
    parcheggi: list(params.parcheggio).filter((value) => UUID_RE.test(value)).slice(0, 50),
    senzaParcheggio: list(params.parcheggio).includes("nessuno"),
    ordina: params.ordina === "parcheggio" || params.ordina === "parcheggio_desc" ? params.ordina : null,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

export type PartyListItem = {
  id: string;
  tipo: PartyType;
  denominazione: string | null;
  nome: string | null;
  cognome: string | null;
  categoria: string | null;
  citta: string | null;
  telefono: string | null;
  non_contattare: boolean;
  campi_verificati: number;
  campi_valorizzati: number;
  somiglianza: number | null;
  parcheggi: PartyParking[];
};

export type PartyParking = { opportunity_id: string; parking_id: string; parcheggio: string; fase: Stage; esito: Outcome };

export async function searchParties(filters: PartyFilters): Promise<{ items: PartyListItem[]; total: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_parties", {
    p_query: filters.q || undefined,
    p_tipo: filters.tipo ?? undefined,
    p_categoria: filters.categoria ?? undefined,
    p_citta: filters.citta || undefined,
    p_solo_da_verificare: filters.soloDaVerificare,
    p_limit: PAGE_SIZE,
    p_offset: (filters.page - 1) * PAGE_SIZE,
    p_parcheggi: filters.parcheggi.length > 0 ? filters.parcheggi : undefined,
    p_senza_parcheggio: filters.senzaParcheggio,
    p_ordina: filters.ordina ?? undefined,
  });
  if (error) throw new Error(`search_parties: ${error.code ?? error.message}`);
  const rows = data ?? [];
  return {
    items: rows.map((row) => ({
      id: row.id,
      tipo: row.tipo,
      denominazione: row.denominazione,
      nome: row.nome,
      cognome: row.cognome,
      categoria: row.categoria,
      citta: row.citta,
      telefono: row.telefono,
      non_contattare: row.non_contattare,
      campi_verificati: row.campi_verificati,
      campi_valorizzati: row.campi_valorizzati,
      somiglianza: row.somiglianza,
      parcheggi: Array.isArray(row.parcheggi) ? (row.parcheggi as unknown as PartyParking[]) : [],
    })),
    total: rows.length > 0 ? Number(rows[0].totale) : 0,
  };
}

// ---------------------------------------------------------------------------
// Party detail
// ---------------------------------------------------------------------------


export type Party = Tables<"parties">;
export type PartyLocation = Tables<"party_locations">;
export type Contact = Tables<"contacts">;

export type Provenance = {
  entita: "parties" | "contacts";
  entita_id: string;
  campo: string;
  stato: Tables<"field_provenance">["stato"];
  fonte: string | null;
  fonte_id: string | null;
  acquisito_il: string | null;
  verificato_il: string | null;
  updated_at: string;
};

export type Distance = { location_id: string; parking_id: string; parcheggio: string; distanza_m: number };

export type HistoryEntry = {
  id: string;
  quando: string;
  utente: string | null;
  entita: string;
  azione: "insert" | "update" | "delete";
  prima: Record<string, unknown> | null;
  dopo: Record<string, unknown> | null;
};

export type DataSource = { id: string; nome: string };

function fail(table: string, error: { code?: string; message: string }): never {
  throw new Error(`${table}: ${error.code ?? error.message}`);
}

export async function getParty(id: string): Promise<Party | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("parties").select("*").eq("id", id).maybeSingle();
  if (error) fail("parties", error);
  return data;
}

export async function listLocations(partyId: string): Promise<PartyLocation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("party_locations")
    .select("*")
    .eq("party_id", partyId)
    .order("principale", { ascending: false })
    .order("created_at");
  if (error) fail("party_locations", error);
  return data;
}

export async function getLocation(partyId: string, locationId: string): Promise<PartyLocation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("party_locations")
    .select("*")
    .eq("party_id", partyId)
    .eq("id", locationId)
    .maybeSingle();
  if (error) fail("party_locations", error);
  return data;
}

export async function listContacts(partyId: string): Promise<Contact[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("contacts").select("*").eq("party_id", partyId).order("created_at");
  if (error) fail("contacts", error);
  return data;
}

export async function getContact(partyId: string, contactId: string): Promise<Contact | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("party_id", partyId)
    .eq("id", contactId)
    .maybeSingle();
  if (error) fail("contacts", error);
  return data;
}

export async function listProvenance(partyId: string, contactIds: string[]): Promise<Provenance[]> {
  const supabase = await createClient();
  const ids = [partyId, ...contactIds];
  const { data, error } = await supabase
    .from("field_provenance")
    .select("entita, entita_id, campo, stato, fonte_id, acquisito_il, verificato_il, updated_at, fonte:data_sources(nome)")
    .in("entita", ["parties", "contacts"])
    .in("entita_id", ids)
    .order("campo");
  if (error) fail("field_provenance", error);
  return data.map(({ fonte, ...row }) => ({
    ...row,
    entita: row.entita as Provenance["entita"],
    fonte: fonte?.nome ?? null,
  }));
}

// Car parks within maxMeters of each location, nearest first.
export async function listDistances(partyId: string, maxMeters: number): Promise<Distance[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("party_location_distances", { p_party_id: partyId, p_max_m: maxMeters });
  if (error) fail("party_location_distances", error);
  return data ?? [];
}

export async function listDataSources(): Promise<DataSource[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("data_sources").select("id, nome").order("nome");
  if (error) fail("data_sources", error);
  return data;
}

// Latest changes to the party, its contacts and its locations, with the author's name.
export async function listHistory(
  partyId: string,
  contactIds: string[],
  locationIds: string[] = [],
  limit = 50,
): Promise<HistoryEntry[]> {
  const supabase = await createClient();
  const ids = [partyId, ...contactIds, ...locationIds];
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, quando, utente_id, entita, azione, prima, dopo")
    .in("entita", ["parties", "contacts", "party_locations"])
    .in("entita_id", ids)
    .order("quando", { ascending: false })
    .limit(limit);
  if (error) fail("audit_logs", error);

  const userIds = [...new Set(data.map((row) => row.utente_id).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users, error: usersError } = await supabase.from("users").select("id, nome, email").in("id", userIds);
    if (usersError) fail("users", usersError);
    users.forEach((user) => names.set(user.id, user.nome?.trim() || user.email));
  }

  return data.map((row) => ({
    id: row.id,
    quando: row.quando,
    utente: row.utente_id ? (names.get(row.utente_id) ?? "Utente non più attivo") : null,
    entita: row.entita,
    azione: row.azione,
    prima: (row.prima as Record<string, unknown> | null) ?? null,
    dopo: (row.dopo as Record<string, unknown> | null) ?? null,
  }));
}

export type DuplicateMatch = {
  livello: "blocco" | "avviso";
  motivo: string;
  party_id: string | null;
  nome: string | null;
  valore: string | null;
};

export async function checkDuplicates(input: {
  partyId?: string;
  denominazione?: string | null;
  nome?: string | null;
  cognome?: string | null;
  piva?: string | null;
  telefono?: string | null;
  email?: string | null;
  sito?: string | null;
  cap?: string | null;
  citta?: string | null;
}): Promise<DuplicateMatch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_party_duplicates", {
    p_party_id: input.partyId,
    p_denominazione: input.denominazione ?? undefined,
    p_nome: input.nome ?? undefined,
    p_cognome: input.cognome ?? undefined,
    p_piva: input.piva ?? undefined,
    p_telefono: input.telefono ?? undefined,
    p_email: input.email ?? undefined,
    p_sito: input.sito ?? undefined,
    p_cap: input.cap ?? undefined,
    p_citta: input.citta ?? undefined,
  });
  if (error) fail("check_party_duplicates", error);
  return (data ?? []).map((row) => ({ ...row, livello: row.livello as DuplicateMatch["livello"] }));
}

export type ParkingFilterOption = { id: string; nome: string };

// Car parks for the party list filter: short name, archived ones last.
export async function listParkingFilterOptions(): Promise<ParkingFilterOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("parking_facilities").select("id, nome, nome_breve, archived_at").order("nome");
  if (error) fail("parking_facilities", error);
  return [...data]
    .sort((a, b) => Number(a.archived_at !== null) - Number(b.archived_at !== null))
    .map((row) => ({ id: row.id, nome: (row.nome_breve ?? row.nome) + (row.archived_at ? " (archiviato)" : "") }));
}

// Google place id of a party (map search import) and the name of who last
// changed its notes.
export async function getPartyExtras(party: Party): Promise<{ placeId: string | null; noteAuthor: string | null }> {
  const supabase = await createClient();
  const [ref, author] = await Promise.all([
    supabase
      .from("external_references")
      .select("id_esterno")
      .eq("sistema", "google_places")
      .eq("entita", "parties")
      .eq("entita_id", party.id)
      .maybeSingle(),
    party.note_modificate_da
      ? supabase.from("users").select("nome, email").eq("id", party.note_modificate_da).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const user = author.data as { nome: string | null; email: string } | null;
  return { placeId: ref.data?.id_esterno ?? null, noteAuthor: user ? user.nome?.trim() || user.email : null };
}

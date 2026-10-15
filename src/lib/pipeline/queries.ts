import { partyName } from "@/lib/parties/labels";
import { createClient } from "@/lib/supabase/server";
import { nextActivityRange, type PipelineFilters } from "./filters";
import type { ActivityKind, LossReasonKey, Outcome, Stage } from "./labels";

// Reads for the pipeline, the opportunity page and "Oggi" (RLS applies).

function fail(table: string, error: { code?: string; message: string }): never {
  throw new Error(`${table}: ${error.code ?? error.message}`);
}

type UserRef = { id: string; nome: string | null; email: string } | null;
const userName = (user: UserRef) => (user ? user.nome?.trim() || user.email : null);
const parkingName = (parking: { nome: string; nome_breve: string | null } | null) => (parking ? (parking.nome_breve ?? parking.nome) : "–");

export type NextTask = { id: string; tipo: ActivityKind; scadenza: string | null };

export type PipelineItem = {
  id: string;
  fase: Stage;
  esito: Outcome;
  partyId: string;
  party: string;
  parkingId: string;
  parking: string;
  responsabileId: string | null;
  responsabile: string | null;
  prossimaIl: string | null;
  next: NextTask | null;
  motivoPerdita: LossReasonKey | null;
};

const MAX_ITEMS = 500;

export async function listPipeline(filters: PipelineFilters, userId: string, now: Date): Promise<{ items: PipelineItem[]; truncated: boolean }> {
  const supabase = await createClient();
  let query = supabase
    .from("opportunities")
    .select(
      "id, fase, esito, prossima_attivita_il, motivo_perdita, responsabile_id, parking_id, party_id, " +
        "party:parties!opportunities_party_id_fkey(denominazione, nome, cognome), " +
        "parking:parking_facilities!opportunities_parking_id_fkey(nome, nome_breve), " +
        "responsabile:users!opportunities_responsabile_id_fkey(id, nome, email)",
    )
    .order("prossima_attivita_il", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(MAX_ITEMS + 1);
  if (filters.parcheggio) query = query.eq("parking_id", filters.parcheggio);
  if (filters.responsabile === "mie") query = query.eq("responsabile_id", userId);
  else if (filters.responsabile !== "tutti") query = query.eq("responsabile_id", filters.responsabile);
  if (filters.fase) query = query.eq("fase", filters.fase);
  if (filters.esito !== "tutte") query = query.eq("esito", filters.esito === "aperte" ? "aperta" : filters.esito === "vinte" ? "vinta" : "persa");
  const range = nextActivityRange(filters.prossima, now);
  if (range?.none) query = query.is("prossima_attivita_il", null);
  if (range?.from) query = query.gte("prossima_attivita_il", range.from);
  if (range?.to) query = query.lt("prossima_attivita_il", range.to);

  const { data, error } = await query;
  if (error) fail("opportunities", error);
  const rows = (data ?? []) as unknown as {
    id: string;
    fase: Stage;
    esito: Outcome;
    prossima_attivita_il: string | null;
    motivo_perdita: LossReasonKey | null;
    responsabile_id: string | null;
    parking_id: string;
    party_id: string;
    party: { denominazione: string | null; nome: string | null; cognome: string | null } | null;
    parking: { nome: string; nome_breve: string | null } | null;
    responsabile: UserRef;
  }[];
  const truncated = rows.length > MAX_ITEMS;
  const items = rows.slice(0, MAX_ITEMS);
  const next = await nextTasks(items.map((row) => row.id));
  return {
    truncated,
    items: items.map((row) => ({
      id: row.id,
      fase: row.fase,
      esito: row.esito,
      partyId: row.party_id,
      party: row.party ? partyName(row.party) : "Soggetto",
      parkingId: row.parking_id,
      parking: parkingName(row.parking),
      responsabileId: row.responsabile_id,
      responsabile: userName(row.responsabile),
      prossimaIl: row.prossima_attivita_il,
      next: next.get(row.id) ?? null,
      motivoPerdita: row.motivo_perdita,
    })),
  };
}

// Earliest open reminder of each opportunity.
async function nextTasks(opportunityIds: string[]): Promise<Map<string, NextTask>> {
  const out = new Map<string, NextTask>();
  if (opportunityIds.length === 0) return out;
  const supabase = await createClient();
  for (let i = 0; i < opportunityIds.length; i += 200) {
    const { data, error } = await supabase
      .from("tasks")
      .select("id, opportunity_id, tipo, scadenza")
      .in("opportunity_id", opportunityIds.slice(i, i + 200))
      .is("completata_il", null)
      .order("scadenza", { ascending: true, nullsFirst: false });
    if (error) fail("tasks", error);
    for (const row of data ?? []) {
      if (row.opportunity_id && !out.has(row.opportunity_id)) {
        out.set(row.opportunity_id, { id: row.id, tipo: row.tipo as ActivityKind, scadenza: row.scadenza });
      }
    }
  }
  return out;
}

export type UserOption = { id: string; nome: string };

export async function listActiveUsers(): Promise<UserOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("users").select("id, nome, email").eq("attivo", true).order("nome");
  if (error) fail("users", error);
  return data.map((user) => ({ id: user.id, nome: user.nome?.trim() || user.email }));
}

export type ParkingOption = { id: string; nome: string };

export async function listParkingOptions(): Promise<ParkingOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("parking_facilities").select("id, nome, nome_breve").is("archived_at", null).order("nome");
  if (error) fail("parking_facilities", error);
  return data.map((row) => ({ id: row.id, nome: row.nome_breve ?? row.nome }));
}

// "Aggiungi a un parcheggio": active car parks, nearest to the party first
// (distance null when no location has coordinates), with the open
// opportunity on the pair, if any.
export type ParkingChoice = { id: string; nome: string; distanzaM: number | null; openOpportunityId: string | null };

export async function listParkingChoices(partyId: string): Promise<ParkingChoice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("party_parking_options", { p_party: partyId });
  if (error) fail("party_parking_options", error);
  return (data ?? []).map((row) => ({ id: row.parking_id, nome: row.nome, distanzaM: row.distanza_m, openOpportunityId: row.opportunity_id }));
}

// ---------------------------------------------------------------------------
// Opportunity page (B6)
// ---------------------------------------------------------------------------

export type OpportunityDetail = {
  id: string;
  fase: Stage;
  esito: Outcome;
  motivoPerdita: LossReasonKey | null;
  prezzoConcorrente: number | null;
  notaPerdita: string | null;
  partyId: string;
  party: string;
  partyNonContattare: boolean;
  parkingId: string;
  parking: string;
  responsabileId: string | null;
  contactId: string | null;
  prodottoId: string | null;
  postiRichiesti: number | null;
  valoreMensile: number | null;
  prossimaIl: string | null;
  importBatchId: string | null;
  createdAt: string;
};

export async function getOpportunity(id: string): Promise<OpportunityDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select(
      "*, party:parties!opportunities_party_id_fkey(denominazione, nome, cognome, non_contattare), parking:parking_facilities!opportunities_parking_id_fkey(nome, nome_breve)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) fail("opportunities", error);
  if (!data) return null;
  const party = data.party as { denominazione: string | null; nome: string | null; cognome: string | null; non_contattare: boolean } | null;
  return {
    id: data.id,
    fase: data.fase as Stage,
    esito: data.esito as Outcome,
    motivoPerdita: data.motivo_perdita as LossReasonKey | null,
    prezzoConcorrente: data.prezzo_concorrente,
    notaPerdita: data.nota_perdita,
    partyId: data.party_id,
    party: party ? partyName(party) : "Soggetto",
    partyNonContattare: party?.non_contattare ?? false,
    parkingId: data.parking_id,
    parking: parkingName(data.parking as { nome: string; nome_breve: string | null } | null),
    responsabileId: data.responsabile_id,
    contactId: data.contact_id,
    prodottoId: data.prodotto_interesse_id,
    postiRichiesti: data.posti_richiesti,
    valoreMensile: data.valore_mensile_stimato,
    prossimaIl: data.prossima_attivita_il,
    importBatchId: data.import_batch_id,
    createdAt: data.created_at,
  };
}

export async function listPartyOpportunities(partyId: string): Promise<PipelineItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select(
      "id, fase, esito, prossima_attivita_il, motivo_perdita, responsabile_id, parking_id, party_id, " +
        "parking:parking_facilities!opportunities_parking_id_fkey(nome, nome_breve), " +
        "responsabile:users!opportunities_responsabile_id_fkey(id, nome, email)",
    )
    .eq("party_id", partyId)
    .order("created_at");
  if (error) fail("opportunities", error);
  const rows = (data ?? []) as unknown as {
    id: string;
    fase: Stage;
    esito: Outcome;
    prossima_attivita_il: string | null;
    motivo_perdita: LossReasonKey | null;
    responsabile_id: string | null;
    parking_id: string;
    party_id: string;
    parking: { nome: string; nome_breve: string | null } | null;
    responsabile: UserRef;
  }[];
  const next = await nextTasks(rows.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    fase: row.fase,
    esito: row.esito,
    partyId: row.party_id,
    party: "",
    parkingId: row.parking_id,
    parking: parkingName(row.parking),
    responsabileId: row.responsabile_id,
    responsabile: userName(row.responsabile),
    prossimaIl: row.prossima_attivita_il,
    next: next.get(row.id) ?? null,
    motivoPerdita: row.motivo_perdita,
  }));
}

export type ProductOption = { id: string; nome: string };

export async function listParkingProducts(parkingId: string): Promise<ProductOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("parking_products").select("id, nome").eq("parking_id", parkingId).eq("attivo", true).order("nome");
  if (error) fail("parking_products", error);
  return data;
}

export type ContactOption = { id: string; nome: string };

export async function listContactOptions(partyId: string): Promise<ContactOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("contacts").select("id, nome, cognome, ruolo").eq("party_id", partyId).order("cognome");
  if (error) fail("contacts", error);
  return data.map((row) => ({
    id: row.id,
    nome: [row.nome, row.cognome].filter(Boolean).join(" ") + (row.ruolo ? ` (${row.ruolo})` : "") || "Contatto senza nome",
  }));
}

// ---------------------------------------------------------------------------
// "Oggi" (B4)
// ---------------------------------------------------------------------------

export type TodayTask = {
  id: string;
  tipo: ActivityKind;
  titolo: string;
  nota: string | null;
  scadenza: string | null;
  opportunityId: string | null;
  partyId: string | null;
  party: string;
  parking: string | null;
  fase: Stage | null;
};

export async function listMyOpenTasks(userId: string, until: Date): Promise<TodayTask[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, tipo, titolo, nota, scadenza, opportunity_id, party_id, " +
        "party:parties!tasks_party_id_fkey(denominazione, nome, cognome), " +
        "opportunity:opportunities!tasks_opportunity_id_fkey(fase, party:parties!opportunities_party_id_fkey(denominazione, nome, cognome), parking:parking_facilities!opportunities_parking_id_fkey(nome, nome_breve))",
    )
    .eq("assegnatario_id", userId)
    .is("completata_il", null)
    .lt("scadenza", until.toISOString())
    .order("scadenza")
    .limit(500);
  if (error) fail("tasks", error);
  type Named = { denominazione: string | null; nome: string | null; cognome: string | null } | null;
  return ((data ?? []) as unknown as {
    id: string;
    tipo: ActivityKind;
    titolo: string;
    nota: string | null;
    scadenza: string | null;
    opportunity_id: string | null;
    party_id: string | null;
    party: Named;
    opportunity: { fase: Stage; party: Named; parking: { nome: string; nome_breve: string | null } | null } | null;
  }[]).map((row) => {
    const named = row.opportunity?.party ?? row.party;
    return {
      id: row.id,
      tipo: row.tipo,
      titolo: row.titolo,
      nota: row.nota,
      scadenza: row.scadenza,
      opportunityId: row.opportunity_id,
      partyId: row.party_id,
      party: named ? partyName(named) : "Soggetto",
      parking: row.opportunity ? parkingName(row.opportunity.parking) : null,
      fase: row.opportunity?.fase ?? null,
    };
  });
}

// Open opportunities of the user with no next activity (CRM-19 warning).
export async function listMyOpportunitiesWithoutNext(userId: string): Promise<PipelineItem[]> {
  const { items } = await listPipeline(
    { vista: "tabella", parcheggio: null, responsabile: userId, fase: null, esito: "aperte", prossima: "nessuna" },
    userId,
    new Date(),
  );
  return items;
}

export async function countMyOverdue(userId: string, now: Date): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("assegnatario_id", userId)
    .is("completata_il", null)
    .lt("scadenza", now.toISOString());
  if (error) return 0;
  return count ?? 0;
}

import { partyName } from "@/lib/parties/labels";
import { createClient } from "@/lib/supabase/server";
import type { OfferStatus } from "@/lib/prospect/labels";
import type { ActivityKind, LossReasonKey, Outcome, Stage } from "./labels";

// Reads for the prospect and opportunity pages (RLS applies). The tables of
// Prospect, Pipeline and Promemoria read from lib/prospect/queries.ts.

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
  // Offer status when the pair is in the pipeline (block 1a-9).
  statoOfferta?: OfferStatus | null;
};

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
  // Pipeline row (block 1a-9).
  statoOfferta: OfferStatus | null;
  promemoria: string | null;
  note: string | null;
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
    party: party ? partyName(party) : "Prospect",
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
    statoOfferta: data.stato_offerta,
    promemoria: data.promemoria_il,
    note: data.note,
  };
}

export async function listPartyOpportunities(partyId: string): Promise<PipelineItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select(
      "id, fase, esito, prossima_attivita_il, motivo_perdita, responsabile_id, parking_id, party_id, stato_offerta, " +
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
    stato_offerta: OfferStatus | null;
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
    statoOfferta: row.stato_offerta,
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

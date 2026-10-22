import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { pageOffset, TABLE_PAGE_SIZE } from "@/lib/tables/paging";
import type { TableQuery } from "@/lib/tables/query";
import { ACTIVE_OFFER_STATUSES, ALL_OFFERS, LAST_CONTACT_FILTERS, PIPELINE_REMINDER_FILTERS, REMINDER_DUE_FILTERS } from "./filters";
import { isOfferStatus, isProspectStatus, type OfferStatus, type ProspectStatus } from "./labels";

export { PIPELINE_FILTERS, PIPELINE_SORTS, PROSPECT_FILTERS, PROSPECT_SORTS, REMINDER_FILTERS, REMINDER_SORTS } from "./filters";

// Reads of the Prospect, Pipeline and Promemoria tables (block 1a-9), with
// the signed-in user's session (RLS). Filters come from the URL and are
// checked here before reaching the database.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(name: string, error: { code?: string; message: string }): never {
  throw new Error(`${name}: ${error.code ?? error.message}`);
}

const uuidOrNull = (value: string | undefined) => (value && UUID.test(value) ? value : null);
const text = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);

// ---------------------------------------------------------------------------
// Prospect
// ---------------------------------------------------------------------------


export type ProspectParking = { parking_id: string; nome: string; opportunity_id: string; stato_offerta: OfferStatus | null };

export type ProspectRow = {
  id: string;
  stato: ProspectStatus;
  motivoNonInteresse: string | null;
  nome: string;
  tipo: "azienda" | "persona";
  categoria: string | null;
  telefono: string | null;
  email: string | null;
  contattoId: string | null;
  referente: string | null;
  ultimoContatto: string | null;
  note: string | null;
  nonContattare: boolean;
  cancellato: boolean;
  parcheggi: ProspectParking[];
  // Contacts besides the main one.
  altriContatti: number;
};

// Arguments of prospect_rows() from the URL query.
export function prospectArgs(query: TableQuery) {
  const f = query.filters;
  return {
    p_stati: isProspectStatus(f.stato) ? [f.stato] : undefined,
    p_parcheggio: uuidOrNull(f.parcheggio) ?? undefined,
    p_senza_parcheggio: f.parcheggio === "nessuno",
    p_nome: text(f.nome),
    p_categoria: text(f.categoria),
    p_telefono: text(f.telefono),
    p_email: text(f.email),
    p_ultimo_contatto: f.contatto && f.contatto in LAST_CONTACT_FILTERS ? f.contatto : undefined,
    p_referente: text(f.referente),
    p_note: text(f.note),
    p_ordina: query.sort ?? "nome",
    p_desc: query.desc,
  };
}

type ProspectRpcRow = Database["public"]["Functions"]["prospect_rows"]["Returns"][number];
type PipelineRpcRow = Database["public"]["Functions"]["pipeline_rows"]["Returns"][number];

export async function listProspects(query: TableQuery): Promise<{ rows: ProspectRow[]; total: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("prospect_rows", {
    ...prospectArgs(query),
    p_limit: TABLE_PAGE_SIZE,
    p_offset: pageOffset(query.page),
  });
  if (error) fail("prospect_rows", error);
  return toProspectRows(data ?? []);
}

export function toProspectRows(rows: ProspectRpcRow[]): { rows: ProspectRow[]; total: number } {
  return {
    total: rows.length > 0 ? Number(rows[0].totale) : 0,
    rows: rows.map((row) => ({
      id: row.id,
      stato: row.stato,
      motivoNonInteresse: row.motivo_non_interesse,
      nome: row.nome,
      tipo: row.tipo,
      categoria: row.categoria,
      telefono: row.telefono,
      email: row.email,
      contattoId: row.contatto_id,
      referente: row.referente,
      ultimoContatto: row.ultimo_contatto_il,
      note: row.note,
      nonContattare: row.non_contattare,
      cancellato: row.cancellato,
      parcheggi: Array.isArray(row.parcheggi) ? (row.parcheggi as unknown as ProspectParking[]) : [],
      altriContatti: row.altri_contatti ?? 0,
    })),
  };
}

// Ids of every prospect matching the filters (CSV export), up to `max`.
export async function listProspectIds(query: TableQuery, max = 5000): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("prospect_rows", { ...prospectArgs(query), p_limit: max, p_offset: 0 });
  if (error) fail("prospect_rows", error);
  return (data ?? []).map((row) => row.id);
}

// ---------------------------------------------------------------------------
// Pipeline and Promemoria
// ---------------------------------------------------------------------------


export type PipelineRow = {
  id: string;
  partyId: string;
  nome: string;
  parkingId: string;
  parcheggio: string;
  responsabileId: string | null;
  responsabile: string | null;
  telefono: string | null;
  email: string | null;
  contattoId: string | null;
  referente: string | null;
  statoOfferta: OfferStatus;
  motivoRifiuto: string | null;
  note: string | null;
  promemoria: string | null;
  giorni: number | null;
  nonContattare: boolean;
  // The prospect's contacts, main first (menu of the row's contact person).
  contatti: RowContact[];
};

export type RowContact = { id: string; nome: string; principale: boolean };

// "pipeline": every row; "promemoria": rows with a reminder date, soonest
// (and overdue) first unless another order is chosen.
// Arguments of pipeline_rows() from the URL query.
export function pipelineArgs(query: TableQuery, view: "pipeline" | "promemoria") {
  const f = query.filters;
  const reminder = view === "promemoria" ? (f.scadenza && f.scadenza in REMINDER_DUE_FILTERS ? f.scadenza : "con") : f.promemoria && f.promemoria in PIPELINE_REMINDER_FILTERS ? f.promemoria : undefined;
  return {
    p_nome: text(f.nome),
    p_parcheggio: uuidOrNull(f.parcheggio) ?? undefined,
    p_responsabile: uuidOrNull(f.responsabile) ?? undefined,
    p_senza_responsabile: f.responsabile === "nessuno",
    p_telefono: text(f.telefono),
    p_email: text(f.email),
    p_referente: text(f.referente),
    // Pipeline: active leads unless a status (or all) is chosen; Promemoria:
    // active leads only.
    p_stati:
      view === "pipeline" && isOfferStatus(f.offerta)
        ? [f.offerta]
        : view === "pipeline" && f.offerta === ALL_OFFERS
          ? undefined
          : [...ACTIVE_OFFER_STATUSES],
    p_note: text(f.note),
    p_promemoria: reminder,
    p_ordina: query.sort ?? (view === "promemoria" ? "promemoria" : "nome"),
    p_desc: query.desc,
  };
}

export async function listPipelineRows(query: TableQuery, view: "pipeline" | "promemoria"): Promise<{ rows: PipelineRow[]; total: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("pipeline_rows", { ...pipelineArgs(query, view), p_limit: TABLE_PAGE_SIZE, p_offset: pageOffset(query.page) });
  if (error) fail("pipeline_rows", error);
  return toPipelineRows(data ?? []);
}

export function toPipelineRows(rows: PipelineRpcRow[]): { rows: PipelineRow[]; total: number } {
  return {
    total: rows.length > 0 ? Number(rows[0].totale) : 0,
    rows: rows.map((row) => ({
      id: row.id,
      partyId: row.party_id,
      nome: row.nome,
      parkingId: row.parking_id,
      parcheggio: row.parcheggio,
      responsabileId: row.responsabile_id,
      responsabile: row.responsabile,
      telefono: row.telefono,
      email: row.email,
      contattoId: row.contatto_id,
      referente: row.referente,
      statoOfferta: row.stato_offerta,
      motivoRifiuto: row.motivo_rifiuto,
      note: row.note,
      promemoria: row.promemoria_il,
      giorni: row.giorni,
      nonContattare: row.non_contattare,
      contatti: Array.isArray(row.contatti) ? (row.contatti as unknown as RowContact[]) : [],
    })),
  };
}

// Overdue reminders, for the menu counter.
export async function countOverdueReminders(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("count_overdue_reminders");
  if (error) fail("count_overdue_reminders", error);
  return data ?? 0;
}

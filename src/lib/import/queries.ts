import { createClient } from "@/lib/supabase/server";
import type { SheetMapping } from "./presets";

// Reads for the import screens (RLS applies).

export type BatchCounts = {
  righe?: number;
  importate?: number;
  nuovi_soggetti?: number;
  aggiunte_a_esistenti?: number;
  scartate?: number;
  escluse?: number;
  con_avvisi?: number;
  attivita?: number;
  offerte?: number;
  report?: ReportRow[];
};

export type ReportRow = { foglio: string; riga: number; soggetto: string | null; esito: string; motivo: string };

export type Batch = {
  id: string;
  file: string;
  created_at: string;
  annullato_il: string | null;
  utente: string | null;
  conteggi: BatchCounts;
};

export type SavedMapping = { id: string; nome: string; tipo_foglio: "anagrafica" | "prospect"; mappatura: SheetMapping };
export type ParkingOption = { id: string; nome: string };

async function userNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("id, nome, email").in("id", ids);
  (data ?? []).forEach((user) => names.set(user.id, user.nome?.trim() || user.email));
  return names;
}

export async function listBatches(): Promise<Batch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("id, file, created_at, annullato_il, utente_id, conteggi")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`import_batches: ${error.code ?? error.message}`);
  const names = await userNames([...new Set(data.map((row) => row.utente_id).filter((id): id is string => Boolean(id)))]);
  return data.map((row) => ({
    id: row.id,
    file: row.file,
    created_at: row.created_at,
    annullato_il: row.annullato_il,
    utente: row.utente_id ? (names.get(row.utente_id) ?? null) : null,
    conteggi: (row.conteggi ?? {}) as BatchCounts,
  }));
}

export async function getBatch(id: string): Promise<Batch | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_batches")
    .select("id, file, created_at, annullato_il, utente_id, conteggi")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`import_batches: ${error.code ?? error.message}`);
  if (!data) return null;
  const names = await userNames(data.utente_id ? [data.utente_id] : []);
  return {
    id: data.id,
    file: data.file,
    created_at: data.created_at,
    annullato_il: data.annullato_il,
    utente: data.utente_id ? (names.get(data.utente_id) ?? null) : null,
    conteggi: (data.conteggi ?? {}) as BatchCounts,
  };
}

// Rows still present from a batch (zero after "annulla import").
export async function batchRowCounts(id: string): Promise<Record<string, number>> {
  const supabase = await createClient();
  const tables = ["parties", "contacts", "opportunities", "activities", "offers"] as const;
  const entries = await Promise.all(
    tables.map(async (table) => {
      const { count } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("import_batch_id", id);
      return [table, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export async function listMappings(): Promise<SavedMapping[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("import_mappings").select("id, nome, tipo_foglio, mappatura").order("nome");
  if (error) throw new Error(`import_mappings: ${error.code ?? error.message}`);
  return data.map((row) => ({
    id: row.id,
    nome: row.nome,
    tipo_foglio: row.tipo_foglio as SavedMapping["tipo_foglio"],
    mappatura: row.mappatura as unknown as SheetMapping,
  }));
}

export async function listParkingOptions(): Promise<ParkingOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parking_facilities")
    .select("id, nome")
    .is("archived_at", null)
    .order("nome");
  if (error) throw new Error(`parking_facilities: ${error.code ?? error.message}`);
  return data;
}

"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { EXPORT_COLUMNS, toCsv, type ExportRow } from "@/lib/export/csv";
import { listProspectIds, PROSPECT_FILTERS, PROSPECT_SORTS } from "@/lib/prospect/queries";
import { readTableQuery } from "@/lib/tables/query";
import { createClient } from "@/lib/supabase/server";

// "Esporta CSV" (block 1a-8, part C; Prospect table since 1a-9). The
// selected prospects, or every prospect matching the table filters; one row
// per contact. Never
// exported: parties erased for GDPR, parties and contacts "do not contact"
// or in the suppression list. The CSV is returned to the browser and never
// stored; the download goes to the audit (who, when, how many rows).

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

export type CsvExportInput = {
  partyIds?: string[];
  // Search parameters of the list ("tutti i filtrati").
  filtri?: Record<string, string | string[]>;
};

export type CsvExportSummary = {
  soggetti: number;
  esportate: number;
  escluse: { nome: string; motivo: string }[];
};

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_PARTIES = 5000;

async function rows(input: CsvExportInput) {
  const query = input.filtri ? readTableQuery(input.filtri, PROSPECT_FILTERS, PROSPECT_SORTS) : null;
  const ids = input.partyIds?.length
    ? [...new Set(input.partyIds.filter((id) => UUID.test(id)))].slice(0, MAX_PARTIES)
    : query
      ? await listProspectIds(query, MAX_PARTIES)
      : [];
  // One car park chosen in the filters: that opportunity's car park and stage.
  const parking = query?.filters.parcheggio && UUID.test(query.filters.parcheggio) ? query.filters.parcheggio : null;
  const supabase = await createClient();
  const result: { soggetti: number; data: Awaited<ReturnType<typeof fetchRows>> } = { soggetti: ids.length, data: [] };
  for (let i = 0; i < ids.length; i += 300) {
    result.data.push(...(await fetchRows(supabase, ids.slice(i, i + 300), parking)));
  }
  return result;
}

async function fetchRows(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[], parking: string | null) {
  const { data, error } = await supabase.rpc("export_party_rows", { p_parties: ids, p_parking: parking as string });
  if (error) throw new Error(`export_party_rows: ${error.code ?? error.message}`);
  return data ?? [];
}

function name(row: { company: string | null; first_name: string | null; last_name: string | null }): string {
  const person = [row.first_name, row.last_name].filter(Boolean).join(" ");
  return [row.company, person].filter(Boolean).join(" · ") || "Prospect";
}

export async function previewCsvExport(input: CsvExportInput): Promise<Result<CsvExportSummary>> {
  if (!(await getCurrentUser())) return { ok: false, message: "Non hai i permessi per questa operazione." };
  try {
    const { soggetti, data } = await rows(input);
    if (soggetti === 0) return { ok: false, message: "Nessun prospect da esportare: seleziona le righe o usa i filtri." };
    return {
      ok: true,
      data: {
        soggetti,
        esportate: data.filter((row) => !row.escluso).length,
        escluse: data.filter((row) => row.escluso).map((row) => ({ nome: name(row), motivo: row.motivo ?? "Escluso" })),
      },
    };
  } catch {
    return { ok: false, message: "Controllo non riuscito. Riprova." };
  }
}

export async function downloadCsvExport(input: CsvExportInput): Promise<Result<{ csv: string; righe: number }>> {
  if (!(await getCurrentUser())) return { ok: false, message: "Non hai i permessi per questa operazione." };
  try {
    const { data } = await rows(input);
    const exported = data.filter((row) => !row.escluso);
    if (exported.length === 0) return { ok: false, message: "Nessuna riga da esportare dopo le esclusioni." };
    const csv = toCsv(
      EXPORT_COLUMNS,
      exported.map((row) => Object.fromEntries(EXPORT_COLUMNS.map((column) => [column, row[column]])) as ExportRow),
    );
    const supabase = await createClient();
    const { error } = await supabase.rpc("log_csv_export", { p_righe: exported.length, p_escluse: data.length - exported.length });
    if (error) return { ok: false, message: "Esportazione non registrata: riprova." };
    return { ok: true, data: { csv, righe: exported.length } };
  } catch {
    return { ok: false, message: "Esportazione non riuscita. Riprova." };
  }
}

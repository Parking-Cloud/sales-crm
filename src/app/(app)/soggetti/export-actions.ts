"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { CRONO_COLUMNS, toCsv, type CronoRow } from "@/lib/export/csv";
import { listFilteredPartyIds, readPartyFilters } from "@/lib/parties/queries";
import { createClient } from "@/lib/supabase/server";

// "Esporta CSV per Crono" (block 1a-8, part C). The selected parties, or
// every party matching the list filters; one row per contact. Never
// exported: parties erased for GDPR, parties and contacts "do not contact"
// or in the suppression list. The CSV is returned to the browser and never
// stored; the download goes to the audit (who, when, how many rows).

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

export type CronoExportInput = {
  partyIds?: string[];
  // Search parameters of the list ("tutti i filtrati").
  filtri?: Record<string, string | string[]>;
};

export type CronoSummary = {
  soggetti: number;
  esportate: number;
  escluse: { nome: string; motivo: string }[];
};

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_PARTIES = 5000;

async function rows(input: CronoExportInput) {
  const filters = input.filtri ? readPartyFilters(input.filtri) : null;
  const ids = input.partyIds?.length
    ? [...new Set(input.partyIds.filter((id) => UUID.test(id)))].slice(0, MAX_PARTIES)
    : filters
      ? await listFilteredPartyIds(filters, MAX_PARTIES)
      : [];
  // One car park chosen in the filters: that opportunity's car park and stage.
  const parking = filters && filters.parcheggi.length === 1 ? filters.parcheggi[0] : null;
  const supabase = await createClient();
  const result: { soggetti: number; data: Awaited<ReturnType<typeof fetchRows>> } = { soggetti: ids.length, data: [] };
  for (let i = 0; i < ids.length; i += 300) {
    result.data.push(...(await fetchRows(supabase, ids.slice(i, i + 300), parking)));
  }
  return result;
}

async function fetchRows(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[], parking: string | null) {
  const { data, error } = await supabase.rpc("crono_export_rows", { p_parties: ids, p_parking: parking as string });
  if (error) throw new Error(`crono_export_rows: ${error.code ?? error.message}`);
  return data ?? [];
}

function name(row: { company: string | null; first_name: string | null; last_name: string | null }): string {
  const person = [row.first_name, row.last_name].filter(Boolean).join(" ");
  return [row.company, person].filter(Boolean).join(" · ") || "Soggetto";
}

export async function previewCronoExport(input: CronoExportInput): Promise<Result<CronoSummary>> {
  if (!(await getCurrentUser())) return { ok: false, message: "Non hai i permessi per questa operazione." };
  try {
    const { soggetti, data } = await rows(input);
    if (soggetti === 0) return { ok: false, message: "Nessun soggetto da esportare: seleziona le righe o usa i filtri." };
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

export async function downloadCronoExport(input: CronoExportInput): Promise<Result<{ csv: string; righe: number }>> {
  if (!(await getCurrentUser())) return { ok: false, message: "Non hai i permessi per questa operazione." };
  try {
    const { data } = await rows(input);
    const exported = data.filter((row) => !row.escluso);
    if (exported.length === 0) return { ok: false, message: "Nessuna riga da esportare dopo le esclusioni." };
    const csv = toCsv(
      CRONO_COLUMNS,
      exported.map((row) => Object.fromEntries(CRONO_COLUMNS.map((column) => [column, row[column]])) as CronoRow),
    );
    const supabase = await createClient();
    const { error } = await supabase.rpc("log_crono_export", { p_righe: exported.length, p_escluse: data.length - exported.length });
    if (error) return { ok: false, message: "Esportazione non registrata: riprova." };
    return { ok: true, data: { csv, righe: exported.length } };
  } catch {
    return { ok: false, message: "Esportazione non riuscita. Riprova." };
  }
}

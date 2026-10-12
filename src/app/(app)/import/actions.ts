"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { FIELDS, type SheetKind, type SheetMapping } from "@/lib/import/presets";
import type { ReportRow } from "@/lib/import/queries";
import { buildPlan, finalStatus, type DuplicateHit, type PlanRow, type SheetInput } from "@/lib/import/transform";
import type { Cell } from "@/lib/import/values";
import { ImportFileError, MAX_FILE_BYTES, readImportFile, type SheetData } from "@/lib/import/workbook";
import { createClient } from "@/lib/supabase/server";

// Import flow (CRM-12…CRM-15). Administrators only; RLS and the SQL
// functions check it again. The uploaded file is read and discarded: only
// its rows travel between the steps, nothing is stored.

const NOT_ADMIN = "Solo l'amministratore può importare file.";
const MAX_ROWS = 5000;
const MAX_COLUMNS = 40;

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function isAdmin(): Promise<boolean> {
  return Boolean((await getCurrentUser())?.isAdmin);
}

// 1. Upload: read the sheets of the file.
export async function readUpload(form: FormData): Promise<Result<{ fileName: string; sheets: SheetData[]; truncated: boolean }>> {
  if (!(await isAdmin())) return { ok: false, message: NOT_ADMIN };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Scegli un file .xlsx o .csv." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: "Il file supera 5 MB." };
  try {
    const sheets = await readImportFile(file.name, await file.arrayBuffer());
    let truncated = false;
    const trimmed = sheets.map((sheet) => {
      if (sheet.rows.length > MAX_ROWS) truncated = true;
      return { name: sheet.name, rows: sheet.rows.slice(0, MAX_ROWS).map((row) => row.slice(0, MAX_COLUMNS)) };
    });
    return { ok: true, data: { fileName: file.name, sheets: trimmed, truncated } };
  } catch (error) {
    return { ok: false, message: error instanceof ImportFileError ? error.message : "Non è stato possibile leggere il file." };
  }
}

export type SheetChoice = { name: string; rows: Cell[][]; mapping: SheetMapping; parkingId: string | null };

function validateChoices(choices: SheetChoice[]): string | null {
  if (choices.length === 0) return "Scegli almeno un foglio da importare.";
  for (const choice of choices) {
    const required = FIELDS[choice.mapping.kind].filter((field) => field.required);
    for (const field of required) {
      if (!choice.mapping.columns[field.key]) return `Foglio “${choice.name}”: indica la colonna di “${field.label}”.`;
    }
    if (!choice.parkingId) return `Foglio “${choice.name}”: scegli il parcheggio di destinazione.`;
  }
  return null;
}

async function duplicateHits(rows: PlanRow[]): Promise<Map<string, DuplicateHit[]>> {
  const supabase = await createClient();
  const candidates = rows
    .filter((row) => row.status !== "scartata" && !row.linkTo)
    .map((row) => ({ ref: row.ref, externalId: row.externalId, party: row.party }));
  const hits = new Map<string, DuplicateHit[]>();
  if (candidates.length === 0) return hits;
  const { data, error } = await supabase.rpc("check_import_rows", { p_rows: candidates as never });
  if (error) throw new Error(`check_import_rows: ${error.code ?? error.message}`);
  for (const hit of data ?? []) {
    const list = hits.get(hit.ref) ?? [];
    list.push({ livello: hit.livello as DuplicateHit["livello"], motivo: hit.motivo, party_id: hit.party_id, nome: hit.nome });
    hits.set(hit.ref, list);
  }
  return hits;
}

// Duplicate check results applied to the plan: blocks are always excluded.
function applyHits(rows: PlanRow[], hits: Map<string, DuplicateHit[]>, keepChoices: boolean): PlanRow[] {
  const checked = rows.map((row) => {
    const duplicates = hits.get(row.ref) ?? [];
    const next = { ...row, duplicates };
    if (duplicates.some((hit) => hit.livello === "blocco")) {
      next.decision = "escludi";
      next.mergeInto = null;
    } else if (!keepChoices && duplicates.length > 0) {
      next.decision = "crea";
    }
    next.status = finalStatus(next);
    return next;
  });
  // Rows linked to an excluded row (same company in the file) are excluded
  // too: they would otherwise recreate a blocked party.
  const excluded = new Set(checked.filter((row) => row.decision === "escludi").map((row) => row.ref));
  return checked.map((row) =>
    row.linkTo && excluded.has(row.linkTo) && row.decision !== "escludi"
      ? { ...row, decision: "escludi" as const, warnings: [...row.warnings, "Esclusa perché collegata a una riga esclusa"] }
      : row,
  );
}

// 2-3. Mapping applied: the plan for the preview, with the duplicate check.
export async function previewImport(choices: SheetChoice[]): Promise<Result<PlanRow[]>> {
  if (!(await isAdmin())) return { ok: false, message: NOT_ADMIN };
  const invalid = validateChoices(choices);
  if (invalid) return { ok: false, message: invalid };
  try {
    const plan = buildPlan(choices satisfies SheetInput[]);
    return { ok: true, data: applyHits(plan, await duplicateHits(plan), false) };
  } catch {
    return { ok: false, message: "Controllo dei doppioni non riuscito. Riprova." };
  }
}

function personName(row: PlanRow): string | null {
  return row.party.denominazione ?? ([row.party.nome, row.party.cognome].filter(Boolean).join(" ") || null);
}

// Error report rows: only the party name, no other personal data.
function reportRows(rows: PlanRow[]): ReportRow[] {
  return rows.flatMap((row): ReportRow[] => {
    const base = { foglio: row.sheet, riga: row.row, soggetto: personName(row) };
    if (row.status === "scartata") return [{ ...base, esito: "scartata", motivo: row.discard ?? "" }];
    const items: ReportRow[] = [];
    if (row.decision === "escludi") {
      const reason =
        row.duplicates.find((hit) => hit.livello === "blocco")?.motivo ??
        (row.linkTo ? "Collegata a una riga esclusa" : "Esclusa dall'utente");
      items.push({ ...base, esito: "esclusa", motivo: reason });
    }
    row.warnings.forEach((warning) =>
      items.push({ ...base, esito: "avviso", motivo: warning.replace(/[^\s:]+@[^\s,]+/g, "[email]").replace(/\+?\d[\d\s]{7,}\d/g, "[telefono]") }),
    );
    return items;
  });
}

// 4. Import: the duplicate check runs again here, blocks cannot be forced.
export async function runImport(fileName: string, rows: PlanRow[]): Promise<Result<{ batchId: string }>> {
  if (!(await isAdmin())) return { ok: false, message: NOT_ADMIN };
  if (!fileName.trim() || rows.length === 0) return { ok: false, message: "Niente da importare." };
  try {
    const checked = applyHits(rows, await duplicateHits(rows), true).map((row) => {
      const valid = row.duplicates.some((hit) => hit.party_id === row.mergeInto);
      return row.decision === "unisci" && !row.linkTo && !valid ? { ...row, decision: "crea" as const, mergeInto: null } : row;
    });
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("import_rows", {
      p_file: fileName.slice(0, 200),
      p_rows: checked as never,
      p_report: reportRows(checked) as never,
    });
    if (error) {
      return {
        ok: false,
        message: error.code === "42501" ? NOT_ADMIN : "Import non riuscito: nessun dato è stato salvato. Riprova o controlla le righe con avvisi.",
      };
    }
    revalidatePath("/import");
    revalidatePath("/soggetti");
    return { ok: true, data: { batchId: (data as { batch_id: string }).batch_id } };
  } catch {
    return { ok: false, message: "Import non riuscito: nessun dato è stato salvato. Riprova." };
  }
}

// 6. Undo.
export type UndoBlocker = { tabella: string; id: string; descrizione: string };

export async function undoImport(batchId: string): Promise<Result<{ blockers: UndoBlocker[] }>> {
  if (!(await isAdmin())) return { ok: false, message: "Solo l'amministratore può annullare un import." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("undo_import_batch", { p_batch: batchId });
  if (error) {
    return { ok: false, message: error.code === "22023" ? "Questo import è già stato annullato." : "Annullamento non riuscito: nessun dato è stato cancellato." };
  }
  const result = data as { ok: boolean; blockers: UndoBlocker[] };
  revalidatePath("/import");
  revalidatePath(`/import/${batchId}`);
  revalidatePath("/soggetti");
  return { ok: true, data: { blockers: result.ok ? [] : result.blockers } };
}

// Saved mappings (CRM-13).
export async function saveMapping(nome: string, kind: SheetKind, mapping: SheetMapping): Promise<Result<{ id: string }>> {
  if (!(await isAdmin())) return { ok: false, message: NOT_ADMIN };
  const name = nome.trim().slice(0, 80);
  if (!name) return { ok: false, message: "Dai un nome alla mappatura." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_mappings")
    .upsert({ nome: name, tipo_foglio: kind, mappatura: mapping as never }, { onConflict: "nome" })
    .select("id")
    .single();
  if (error) return { ok: false, message: "Mappatura non salvata. Riprova." };
  revalidatePath("/import");
  return { ok: true, data: { id: data.id } };
}

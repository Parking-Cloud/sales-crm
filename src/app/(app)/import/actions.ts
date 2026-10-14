"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { FIELDS, type SheetKind, type SheetMapping } from "@/lib/import/presets";
import type { ReportRow } from "@/lib/import/queries";
import { buildPlan, finalStatus, type DuplicateHit, type PlanRow, type SheetInput } from "@/lib/import/transform";
import { compactRows, type Cell } from "@/lib/import/values";
import { MAX_COLUMNS, MAX_ROWS } from "@/lib/import/limits";
import { isUuid, readUndo, type UndoResult } from "@/lib/import/undo";
import { createClient } from "@/lib/supabase/server";

// Import flow (CRM-12…CRM-15). Administrators only; RLS and the SQL
// functions check it again. The file is read in the browser and never sent:
// only the rows of the chosen sheets, without empty rows, reach the server.
// Each action logs its step durations and counts (never data).

const NOT_ADMIN = "Solo l'amministratore può importare file.";

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

async function isAdmin(): Promise<boolean> {
  return Boolean((await getCurrentUser())?.isAdmin);
}

// Durations in milliseconds of the steps of one action, logged as one line.
function stopwatch(action: string) {
  const start = performance.now();
  let last = start;
  const steps: Record<string, number> = {};
  return {
    step(name: string) {
      const now = performance.now();
      steps[name] = Math.round(now - last);
      last = now;
    },
    log(counts: Record<string, number>) {
      console.info(JSON.stringify({ evento: `import.${action}`, ms: { ...steps, totale: Math.round(performance.now() - start) }, ...counts }));
    },
  };
}

export type SheetChoice = { name: string; rows: Cell[][]; mapping: SheetMapping; parkingId: string | null };

// Rows come from the browser: rebuilt from scratch with the same cleaning
// as the reader (empty rows dropped, errors and odd values empty, limits).
function sanitizeChoices(choices: unknown): SheetChoice[] | null {
  if (!Array.isArray(choices) || choices.length > 20) return null;
  const clean: SheetChoice[] = [];
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") return null;
    const { name, rows, mapping, parkingId } = choice as Record<string, unknown>;
    if (typeof name !== "string" || !Array.isArray(rows) || !mapping || typeof mapping !== "object") return null;
    const { kind, headerRow, columns } = mapping as Record<string, unknown>;
    if ((kind !== "anagrafica" && kind !== "prospect") || typeof headerRow !== "number" || !columns || typeof columns !== "object") return null;
    const letters = Object.fromEntries(
      FIELDS[kind].map((field) => {
        const letter = (columns as Record<string, unknown>)[field.key];
        return [field.key, typeof letter === "string" && /^[A-Z]{1,2}$/.test(letter) ? letter : null];
      }),
    );
    clean.push({
      name: name.slice(0, 100),
      rows: compactRows(rows, MAX_ROWS, MAX_COLUMNS),
      mapping: { kind, headerRow: Math.min(Math.max(1, Math.trunc(headerRow)), 50), columns: letters },
      parkingId: typeof parkingId === "string" && parkingId ? parkingId : null,
    });
  }
  return clean;
}

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

// Sheets that give no row with a name: wrong header row or wrong columns.
function emptySheet(choices: SheetChoice[], plan: PlanRow[]): string | null {
  for (const choice of choices) {
    const named = plan.some((row) => row.sheet === choice.name.trim() && row.status !== "scartata");
    if (!named) {
      return `Foglio “${choice.name.trim()}”: nessuna riga con il nome compilato. Controlla la riga delle intestazioni e le colonne: forse il foglio non corrisponde al formato scelto.`;
    }
  }
  return null;
}

// 2-3. Mapping applied: the plan for the preview, with the duplicate check
// of all rows in one database call.
export async function previewImport(input: SheetChoice[]): Promise<Result<PlanRow[]>> {
  const time = stopwatch("anteprima");
  if (!(await isAdmin())) return { ok: false, message: NOT_ADMIN };
  time.step("utente");
  const choices = sanitizeChoices(input);
  if (!choices) return { ok: false, message: "Dati del file non validi. Ricarica il file e riprova." };
  const invalid = validateChoices(choices);
  if (invalid) return { ok: false, message: invalid };
  time.step("pulizia");
  try {
    const plan = buildPlan(choices satisfies SheetInput[]);
    time.step("piano");
    const empty = emptySheet(choices, plan);
    if (empty) return { ok: false, message: empty };
    const hits = await duplicateHits(plan);
    time.step("doppioni");
    const checked = applyHits(plan, hits, false);
    time.log({
      fogli: choices.length,
      righe_ricevute: choices.reduce((total, choice) => total + choice.rows.filter((row) => row.length > 0).length, 0),
      righe_piano: checked.length,
      doppioni: checked.filter((row) => row.duplicates.length > 0).length,
    });
    return { ok: true, data: checked };
  } catch {
    time.log({ errore: 1 });
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
  const time = stopwatch("import");
  if (!(await isAdmin())) return { ok: false, message: NOT_ADMIN };
  if (typeof fileName !== "string" || !fileName.trim() || !Array.isArray(rows) || rows.length === 0) {
    return { ok: false, message: "Niente da importare." };
  }
  if (rows.length > MAX_ROWS * 2) return { ok: false, message: "Troppe righe in un solo import: dividi il file." };
  time.step("utente");
  try {
    const hits = await duplicateHits(rows);
    time.step("doppioni");
    const checked = applyHits(rows, hits, true).map((row) => {
      const valid = row.duplicates.some((hit) => hit.party_id === row.mergeInto);
      return row.decision === "unisci" && !row.linkTo && !valid ? { ...row, decision: "crea" as const, mergeInto: null } : row;
    });
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("import_rows", {
      p_file: fileName.slice(0, 200),
      p_rows: checked as never,
      p_report: reportRows(checked) as never,
    });
    time.step("scrittura");
    time.log({ righe: rows.length, errore: error ? 1 : 0 });
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
    time.log({ righe: rows.length, errore: 1 });
    return { ok: false, message: "Import non riuscito: nessun dato è stato salvato. Riprova." };
  }
}

// 6. Undo.
export async function undoImport(batchId: string): Promise<Result<UndoResult>> {
  const time = stopwatch("annullamento");
  if (!(await isAdmin())) return { ok: false, message: "Solo l'amministratore può annullare un import." };
  if (!isUuid(batchId)) return { ok: false, message: "Import non trovato." };
  time.step("utente");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("undo_import_batch", { p_batch: batchId });
    time.step("database");
    if (error) {
      time.log({ errore: 1 });
      return {
        ok: false,
        message:
          error.code === "22023"
            ? "Questo import è già stato annullato."
            : error.code === "P0002"
              ? "Import non trovato."
              : "Annullamento non riuscito: nessun dato è stato cancellato. Riprova.",
      };
    }
    const result = readUndo(data);
    if (!result) {
      time.log({ errore: 1 });
      return { ok: false, message: "Annullamento non riuscito: risposta non riconosciuta. Ricarica la pagina per vedere lo stato dell'import." };
    }
    time.log({
      bloccato: result.blocked ? 1 : 0,
      blocchi: result.blocked?.totale ?? 0,
      ...Object.fromEntries(Object.entries(result.eliminati).map(([key, value]) => [`eliminati_${key}`, value])),
    });
    if (!result.blocked) {
      revalidatePath("/import");
      revalidatePath(`/import/${batchId}`);
      revalidatePath("/soggetti", "layout");
    }
    return { ok: true, data: result };
  } catch {
    time.log({ errore: 1 });
    return { ok: false, message: "Annullamento non riuscito: nessun dato è stato cancellato. Riprova." };
  }
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

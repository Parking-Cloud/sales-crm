import ExcelJS from "exceljs";
import type { Cell } from "./values";

// Reads .xlsx and .csv files into plain rows of cells. Server side only.
// The file content is never stored: only these rows are used.

export type SheetData = {
  name: string;
  // rows[0] is spreadsheet row 1; cells[0] is column A.
  rows: Cell[][];
};

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export class ImportFileError extends Error {}

type ExcelValue = ExcelJS.CellValue;

// Formulas give their cached result; errors (#N/A of a VLOOKUP) are empty.
function cellValue(value: ExcelValue): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("error" in value) return null;
    if ("formula" in value || "sharedFormula" in value) {
      return cellValue((value as { result?: ExcelValue }).result ?? null);
    }
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("text" in value) return cellValue(value.text as ExcelValue);
  }
  return null;
}

export async function readXlsx(buffer: ArrayBuffer): Promise<SheetData[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new ImportFileError("Il file non è un .xlsx leggibile.");
  }
  return workbook.worksheets.map((sheet) => {
    const rows: Cell[][] = [];
    for (let r = 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const cells: Cell[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) cells.push(cellValue(row.getCell(c).value));
      rows.push(cells);
    }
    return { name: sheet.name, rows };
  });
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

function decode(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buffer);
  const text = utf8.includes("�") ? new TextDecoder("windows-1252").decode(buffer) : utf8;
  return text.replace(/^﻿/, "");
}

// ";" or "," : the one found more often outside quotes in the first lines.
export function detectDelimiter(text: string): ";" | "," {
  let semicolons = 0;
  let commas = 0;
  let quoted = false;
  let lines = 0;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === ";") semicolons++;
    else if (!quoted && char === ",") commas++;
    else if (!quoted && char === "\n" && ++lines >= 5) break;
  }
  return semicolons >= commas ? ";" : ",";
}

export function parseCsv(text: string, delimiter: string = detectDelimiter(text)): Cell[][] {
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field === "" ? null : field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field === "" ? null : field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field === "" ? null : field);
    rows.push(row);
  }
  return rows;
}

export function readCsv(buffer: ArrayBuffer, fileName: string): SheetData[] {
  return [{ name: fileName.replace(/\.csv$/i, ""), rows: parseCsv(decode(buffer)) }];
}

export async function readImportFile(fileName: string, buffer: ArrayBuffer): Promise<SheetData[]> {
  if (buffer.byteLength > MAX_FILE_BYTES) throw new ImportFileError("Il file supera 5 MB.");
  if (/\.xlsx$/i.test(fileName)) return readXlsx(buffer);
  if (/\.csv$/i.test(fileName)) return readCsv(buffer, fileName);
  throw new ImportFileError("Formato non supportato: carica un file .xlsx o .csv.");
}

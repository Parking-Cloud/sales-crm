import ExcelJS from "exceljs";
import { MAX_COLUMNS, MAX_FILE_BYTES, MAX_ROWS } from "./limits";
import { compactRows, type Cell } from "./values";

// Reads .xlsx and .csv files into plain rows of cells, in the browser (the
// file never leaves the computer) and in the tests. Rows without real values
// are dropped right away (see compactRows): real files carry hundreds of rows
// with formatting only or with "#N/A" formulas.

export type SheetData = {
  name: string;
  // rows[0] is spreadsheet row 1; cells[0] is column A. Empty rows are [].
  rows: Cell[][];
};

export type ReadResult = { sheets: SheetData[]; truncated: boolean };

export class ImportFileError extends Error {}

type ExcelValue = ExcelJS.CellValue;

// Formulas give their cached result; errors (#N/A of a VLOOKUP) are empty.
// Hyperlinks and rich text give their text. Anything else is empty.
function cellValue(value: ExcelValue, depth = 0): unknown {
  if (value === null || value === undefined || depth > 3) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("error" in value) return null;
    if ("formula" in value || "sharedFormula" in value) {
      return cellValue((value as { result?: ExcelValue }).result ?? null, depth + 1);
    }
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text ?? "").join("");
    if ("text" in value) return cellValue(value.text as ExcelValue, depth + 1);
  }
  return null;
}

// Only rows that hold a value are visited (eachRow skips rows with
// formatting only), and only their own cells.
function sheetRows(sheet: ExcelJS.Worksheet): { rows: unknown[][]; truncated: boolean } {
  const rows: unknown[][] = [];
  let truncated = false;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > MAX_ROWS) {
      truncated = true;
      return;
    }
    const values = row.values as ExcelValue[]; // 1-based, sparse
    const cells: unknown[] = [];
    for (let c = 1; c < Math.min(values.length, MAX_COLUMNS + 1); c++) cells.push(cellValue(values[c]));
    rows[rowNumber - 1] = cells;
  });
  return { rows, truncated };
}

export async function readXlsx(buffer: ArrayBuffer): Promise<ReadResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new ImportFileError("Il file non è un .xlsx leggibile.");
  }
  let truncated = false;
  const sheets = workbook.worksheets.map((sheet) => {
    const read = sheetRows(sheet);
    truncated ||= read.truncated;
    return { name: sheet.name, rows: compactRows(Array.from(read.rows), MAX_ROWS, MAX_COLUMNS) };
  });
  return { sheets, truncated };
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

export function readCsv(buffer: ArrayBuffer, fileName: string): ReadResult {
  const rows = parseCsv(decode(buffer));
  return {
    sheets: [{ name: fileName.replace(/\.csv$/i, ""), rows: compactRows(rows, MAX_ROWS, MAX_COLUMNS) }],
    truncated: rows.length > MAX_ROWS,
  };
}

export async function readImportFile(fileName: string, buffer: ArrayBuffer): Promise<ReadResult> {
  if (buffer.byteLength > MAX_FILE_BYTES) throw new ImportFileError("Il file supera 5 MB.");
  if (/\.xlsx$/i.test(fileName)) return readXlsx(buffer);
  if (/\.csv$/i.test(fileName)) return readCsv(buffer, fileName);
  throw new ImportFileError("Formato non supportato: carica un file .xlsx o .csv.");
}

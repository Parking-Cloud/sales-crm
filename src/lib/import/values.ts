// Cleaning of single cell values read from Excel or CSV files.
// Pure functions, relative imports only: unit tested with node:test.

export type Cell = string | number | boolean | Date | null;

// Values that mean "nothing here" in the source files.
const PLACEHOLDERS = new Set(["non disponibile", "non disp", "non disp.", "nd", "n.d.", "n/d", "-", "--", "/", "x"]);

// Excel error values, also when a formula caches them as plain text
// (t="str"), in English and Italian.
const ERROR_VALUES = new Set([
  "#n/a", "#n/d", "#value!", "#valore!", "#ref!", "#rif!", "#name?", "#nome?",
  "#div/0!", "#null!", "#nullo!", "#num!", "#calc!", "#spill!", "#espansione!",
]);

export function isErrorValue(text: string): boolean {
  return ERROR_VALUES.has(text.trim().toLowerCase());
}

export const WEB_FORM_MARKER = "compilare form sul sito";

// One cell as read from a file: Excel errors, blank or whitespace-only
// text and non-finite numbers become null. Anything else is kept as it is.
export function normalizeCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() === "" || isErrorValue(value) ? null : value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  return null;
}

// Rows without any real value (formatting only, "#N/A", spaces) become empty
// arrays; trailing empty cells and rows are dropped. Row positions do not
// change, so row numbers stay those of the spreadsheet.
export function compactRows(rows: readonly unknown[], maxRows: number, maxColumns: number): Cell[][] {
  const out: Cell[][] = [];
  let last = -1;
  for (let index = 0; index < Math.min(rows.length, maxRows); index++) {
    const source = rows[index];
    const cells: Cell[] = [];
    let width = 0;
    if (Array.isArray(source)) {
      for (let c = 0; c < Math.min(source.length, maxColumns); c++) {
        const cell = normalizeCell(source[c]);
        cells.push(cell);
        if (cell !== null) width = c + 1;
      }
    }
    out.push(width === cells.length ? cells : cells.slice(0, width));
    if (width > 0) last = index;
  }
  return out.slice(0, last + 1);
}

// Trimmed text of a cell, or null when empty, a placeholder or an Excel error.
export function cleanText(value: Cell): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return isoDate(value);
  const text = String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (text === "" || PLACEHOLDERS.has(text.toLowerCase()) || isErrorValue(text)) return null;
  return text;
}

// Several values in one cell, separated by "//" (or a line break).
export function splitMulti(value: Cell): string[] {
  if (value === null || value === undefined) return [];
  if (value instanceof Date || typeof value === "number") {
    const single = cleanText(value);
    return single ? [single] : [];
  }
  return String(value)
    // "//" separates values, except right after "http:" or "https:".
    .split(/(?<!:)\/\/|\n/)
    .map((part) => cleanText(part))
    .filter((part): part is string => part !== null);
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export function isoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return isoDate(date);
}

// Excel serial day numbers (1900 system) to ISO dates.
function fromExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  return isoDate(new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000));
}

// One date as "yyyy-mm-dd", from a Date, an Excel serial or Italian text
// (dd/mm/yyyy, dd-mm-yy, dd.mm.yyyy). Null when not a date.
export function parseDate(value: Cell): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : isoDate(value);
  if (typeof value === "number") return fromExcelSerial(value);
  const text = String(value).trim();
  const italian = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (italian) {
    const year = italian[3].length === 2 ? 2000 + Number(italian[3]) : Number(italian[3]);
    return validDate(year, Number(italian[2]), Number(italian[1]));
  }
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  return null;
}

// All dates in a cell, also "28/09/2026//01/10/2026".
export function parseDates(value: Cell): string[] {
  if (value instanceof Date || typeof value === "number") {
    const single = parseDate(value);
    return single ? [single] : [];
  }
  return splitMulti(value)
    .map((part) => parseDate(part))
    .filter((date): date is string => date !== null);
}

// ---------------------------------------------------------------------------
// Phones and emails
// ---------------------------------------------------------------------------

export type PhoneValue = { value: string; warning: string | null };

// Phones of a cell. Numbers stored as Excel numbers lose the leading zero of
// landlines: those starting with 3 are mobiles, the others get a warning.
export function parsePhones(value: Cell): PhoneValue[] {
  if (typeof value === "number") {
    const digits = String(Math.trunc(value));
    if (digits.startsWith("3")) return [{ value: digits, warning: null }];
    return [{ value: digits, warning: `Telefono ${digits}: possibile zero iniziale perso` }];
  }
  return splitMulti(value).map((part) => {
    const digits = part.replace(/[\s.\-/()+]/g, "");
    if (!/^\d{6,15}$/.test(digits)) return { value: part, warning: `Telefono non valido: ${part}` };
    return { value: part, warning: null };
  });
}

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;

export type EmailCell = { emails: string[]; webForm: boolean; invalid: string[] };

// Emails of a cell; "Compilare form sul sito" marks the web form channel.
export function parseEmails(value: Cell): EmailCell {
  const result: EmailCell = { emails: [], webForm: false, invalid: [] };
  for (const part of splitMulti(value)) {
    const lower = part.toLowerCase();
    if (lower.includes(WEB_FORM_MARKER)) result.webForm = true;
    else if (EMAIL.test(lower)) result.emails.push(lower);
    else result.invalid.push(part);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Numbers and amounts
// ---------------------------------------------------------------------------

// A whole number, or null ("ND", text, empty).
export function parseCount(value: Cell): number | null {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : null;
  const text = cleanText(value);
  if (!text || !/^\d{1,6}$/.test(text)) return null;
  return Number(text);
}

// An amount if the cell holds exactly one readable number ("250", "250 €",
// "1.234,50"); null for texts like "250 € / 12€ giorno" or "230 / 210".
export function parseAmount(value: Cell): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const text = cleanText(value);
  if (!text) return null;
  const match = text.match(/^(?:€\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(?:€|euro)?$/i);
  if (!match) return null;
  return Number(`${match[1].replace(/\./g, "")}.${match[2] ?? "0"}`);
}

// ---------------------------------------------------------------------------
// Notes written as a diary
// ---------------------------------------------------------------------------

export type DiaryEntry = { date: string | null; text: string };

// "24/09/2026: testo  05/10/2026: testo" -> one entry per date. Text before
// the first date (or with no date at all) stays a note without a date.
export function splitDiary(value: Cell): DiaryEntry[] {
  const text = cleanText(value);
  if (!text) return [];
  const pattern = /(\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2}))\s*[:\-–]\s*/g;
  const entries: DiaryEntry[] = [];
  let lastIndex = 0;
  let lastDate: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const date = parseDate(match[1]);
    if (!date) continue;
    const before = text.slice(lastIndex, match.index).trim();
    if (before) entries.push({ date: lastDate, text: before });
    lastDate = date;
    lastIndex = pattern.lastIndex;
  }
  const rest = text.slice(lastIndex).trim();
  if (rest) entries.push({ date: lastDate, text: rest });
  return entries;
}

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

// "Mario Rossi - Responsabile" -> name and role; split on the dash.
export function splitNameAndRole(value: Cell): { name: string | null; role: string | null } {
  const text = cleanText(value);
  if (!text) return { name: null, role: null };
  // Only a dash with a space around it: "Anna-Maria Rossi" stays a name.
  const [name, ...role] = text.split(/\s+[-–]\s*|\s*[-–]\s+/);
  return { name: cleanText(name ?? null), role: cleanText(role.join(" - ") || null) };
}

// "Mario Rossi" -> first name and last name (first word, then the rest).
export function splitPersonName(value: string | null): { nome: string | null; cognome: string | null } {
  const text = cleanText(value);
  if (!text) return { nome: null, cognome: null };
  const words = text.split(" ");
  if (words.length === 1) return { nome: null, cognome: words[0] };
  return { nome: words[0], cognome: words.slice(1).join(" ") };
}

// Company markers: a name with one of these is a company, not a person.
const COMPANY_MARKERS =
  /\b(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|s\.?c\.?r\.?l\.?|srls|spa|snc|sas|onlus|coop|studio|hotel|ristorante|bar|pizzeria|associazione|agenzia|centro|clinica|farmacia|societ[aà]|group|gruppo|consulting|service|services|italia)\b/i;

export function looksLikeCompany(name: string): boolean {
  return COMPANY_MARKERS.test(name) || /\d/.test(name) || name.split(" ").length > 4;
}

// Key to match the same name across sheets: lower case, letters and digits only.
export function nameKey(name: string | null): string {
  return (name ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

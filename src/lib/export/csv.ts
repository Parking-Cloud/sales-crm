// CSV for Crono (block 1a-8, part C): comma separated, UTF-8, one header
// row with simple English names that map easily in Crono's import. RFC 4180
// quoting: fields with commas, quotes, line breaks or edge spaces go in
// double quotes, inner quotes doubled; lines end with CRLF. Pure: unit
// tested. The file is built in the browser and never stored on the server.

export const CRONO_COLUMNS = [
  "first_name",
  "last_name",
  "job_title",
  "email",
  "phone",
  "company",
  "website",
  "city",
  "parking",
  "stage",
  "email_permission",
] as const;
export type CronoColumn = (typeof CRONO_COLUMNS)[number];
export type CronoRow = Record<CronoColumn, string | null>;

export function csvField(value: string | null | undefined): string {
  const text = value ?? "";
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<C extends string>(columns: readonly C[], rows: Record<C, string | null>[]): string {
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvField(row[column])).join(","))].join("\r\n") + "\r\n";
}

// File name with the day, for example "crono-contatti-2026-10-15.csv".
export function cronoFileName(day: string): string {
  return `crono-contatti-${day}.csv`;
}

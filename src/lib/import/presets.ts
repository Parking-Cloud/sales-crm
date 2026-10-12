// Import presets: which sheet holds what, where the headers are and which
// column feeds which field. Mappings are editable in the UI and can be saved
// with a name (public.import_mappings).

export type SheetKind = "anagrafica" | "prospect";

export type FieldDef = { key: string; label: string; required?: boolean };

export const SHEET_KIND_LABELS: Record<SheetKind, string> = {
  anagrafica: "Anagrafica attività commerciali",
  prospect: "Prospect e richieste",
};

export const FIELDS: Record<SheetKind, FieldDef[]> = {
  anagrafica: [
    { key: "stato", label: "Stato (interesse)" },
    { key: "id_contatto", label: "ID contatto" },
    { key: "nome", label: "Nome azienda", required: true },
    { key: "settore", label: "Settore" },
    { key: "referente_nome", label: "Nome referente" },
    { key: "referente_ruolo", label: "Ruolo referente" },
    { key: "sito", label: "Sito" },
    { key: "email", label: "Email" },
    { key: "telefono", label: "Telefono" },
    { key: "data_primo", label: "Data primo contatto" },
    { key: "data_ultimo", label: "Data ultimo contatto" },
    { key: "email_stato", label: "Email (stato invio)" },
    { key: "chiamata", label: "Chiamata" },
    { key: "note", label: "Note" },
    { key: "posti", label: "Numero posti potenziali" },
  ],
  prospect: [
    { key: "prospect", label: "Prospect (nome)", required: true },
    { key: "email", label: "Email" },
    { key: "telefono", label: "Telefono" },
    { key: "referente", label: "Nome e ruolo referente" },
    { key: "data_offerta", label: "Data offerta" },
    { key: "data_sollecito", label: "Data sollecito" },
    { key: "note", label: "Note" },
    { key: "offerta", label: "Offerta" },
    { key: "posti", label: "Posti 7/7" },
    { key: "stato", label: "Stato offerta" },
    { key: "feedback", label: "Feedback cliente" },
  ],
};

export type SheetMapping = {
  kind: SheetKind;
  // Spreadsheet row (1-based) holding the headers; data starts on the next row.
  headerRow: number;
  // Field key -> column letter, or null when not in the file.
  columns: Record<string, string | null>;
};

export type Preset = {
  key: string;
  label: string;
  sheets: { kind: SheetKind; matches: (sheetName: string) => boolean; mapping: SheetMapping }[];
};

export function normalizeSheetName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// "CRM parcheggio, formato 2026": the sheet names in the source file carry a
// typo and a trailing space ("Anagrafica Attvità Commerciali "), so sheets
// are recognized by a keyword, not by the exact name.
export const CRM_2026: Preset = {
  key: "crm-parcheggio-2026",
  label: "CRM parcheggio, formato 2026",
  sheets: [
    {
      kind: "anagrafica",
      matches: (name) => normalizeSheetName(name).includes("anagrafica"),
      mapping: {
        kind: "anagrafica",
        headerRow: 1,
        columns: {
          stato: "A",
          id_contatto: "B",
          nome: "C",
          settore: "D",
          referente_nome: "E",
          referente_ruolo: "F",
          sito: "G",
          email: "H",
          telefono: "I",
          data_primo: "J",
          data_ultimo: "K",
          email_stato: "L",
          chiamata: "M",
          note: "N",
          posti: "P",
        },
      },
    },
    {
      kind: "prospect",
      matches: (name) => normalizeSheetName(name).includes("prospect"),
      mapping: {
        kind: "prospect",
        headerRow: 5,
        columns: {
          prospect: "B",
          email: "C",
          telefono: "D",
          referente: "E",
          data_offerta: "F",
          data_sollecito: "G",
          note: "H",
          offerta: "I",
          posti: "J",
          stato: "K",
          feedback: "L",
        },
      },
    },
  ],
};

export const PRESETS: Preset[] = [CRM_2026];

// Mapping proposed by a preset for a sheet, or null if the preset has none.
export function proposeMapping(preset: Preset, sheetName: string): SheetMapping | null {
  const match = preset.sheets.find((sheet) => sheet.matches(sheetName));
  return match ? structuredClone(match.mapping) : null;
}

// Empty mapping for sheets the preset does not know (e.g. a CSV).
export function emptyMapping(kind: SheetKind): SheetMapping {
  return {
    kind,
    headerRow: 1,
    columns: Object.fromEntries(FIELDS[kind].map((field) => [field.key, null])),
  };
}

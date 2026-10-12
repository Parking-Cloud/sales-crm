import { parseDecimal } from "@/lib/format";
import type { TablesInsert } from "@/lib/supabase/types";
import {
  CAMPAIGN_STATUS_LABELS,
  DAY_PRESETS,
  DEFAULT_SEARCH_RADIUS_M,
  DEFAULT_VAT_PCT,
  PARKING_TYPE_LABELS,
  PRODUCT_PERIOD_LABELS,
  PRODUCT_TYPE_LABELS,
  isOneOf,
} from "./labels";

// Server-side validation of the car park and product forms. Messages are the
// ones shown under each field.

export type FieldErrors = Record<string, string>;

// Raw form values, sent back to the form to refill it after an error.
export type RawValues = Record<string, string>;

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: string): string | null {
  return value === "" ? null : value;
}

// Whole number >= min, or null when empty; errors go into `errors`.
function wholeNumber(
  raw: string,
  field: string,
  errors: FieldErrors,
  { min = 0, max = 1_000_000 }: { min?: number; max?: number } = {},
): number | null {
  if (raw === "") return null;
  if (!/^\d+$/.test(raw.replace(/\./g, ""))) {
    errors[field] = "Inserisci un numero intero.";
    return null;
  }
  const value = Number(raw.replace(/\./g, ""));
  if (value < min || value > max) {
    errors[field] = `Inserisci un numero tra ${min} e ${max.toLocaleString("it-IT")}.`;
    return null;
  }
  return value;
}

function coordinate(raw: string, field: string, limit: number, errors: FieldErrors): number | null {
  const value = parseDecimal(raw);
  if (value === null) return null;
  if (Number.isNaN(value) || Math.abs(value) > limit) {
    errors[field] = `Inserisci un numero tra -${limit} e ${limit}, con la virgola o il punto.`;
    return null;
  }
  return value;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Car park
// ---------------------------------------------------------------------------

export const FACILITY_FIELDS = [
  "nome",
  "tipo",
  "indirizzo",
  "cap",
  "citta",
  "capacita",
  "posti_commerciali",
  "raggio_m",
  "responsabile_id",
  "stato_campagna",
  "note",
  "lat",
  "lng",
] as const;

export type FacilityValues = Omit<TablesInsert<"parking_facilities">, "id" | "created_by" | "archived_at">;

export function readRawValues(form: FormData, fields: readonly string[]): RawValues {
  return Object.fromEntries(fields.map((name) => [name, text(form, name)]));
}

export function validateFacility(
  form: FormData,
  allowedResponsabili: Set<string>,
): { values: FacilityValues | null; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const raw = readRawValues(form, FACILITY_FIELDS);

  if (raw.nome === "") errors.nome = "Inserisci il nome del parcheggio.";
  else if (raw.nome.length > 120) errors.nome = "Il nome può avere al massimo 120 caratteri.";

  if (!isOneOf(PARKING_TYPE_LABELS, raw.tipo)) errors.tipo = "Scegli il tipo di parcheggio.";

  if (raw.indirizzo === "") errors.indirizzo = "Inserisci l'indirizzo.";
  if (raw.citta === "") errors.citta = "Inserisci la città.";
  if (raw.cap !== "" && !/^\d{5}$/.test(raw.cap)) errors.cap = "Il CAP ha 5 cifre.";

  const capacita = wholeNumber(raw.capacita, "capacita", errors);
  const postiCommerciali = wholeNumber(raw.posti_commerciali, "posti_commerciali", errors);
  if (capacita !== null && postiCommerciali !== null && postiCommerciali > capacita) {
    errors.posti_commerciali = "I posti commercializzabili non possono superare la capacità totale.";
  }

  const raggio =
    raw.raggio_m === ""
      ? DEFAULT_SEARCH_RADIUS_M
      : wholeNumber(raw.raggio_m, "raggio_m", errors, { min: 50, max: 50_000 });

  if (raw.responsabile_id !== "" && (!UUID.test(raw.responsabile_id) || !allowedResponsabili.has(raw.responsabile_id))) {
    errors.responsabile_id = "Scegli un responsabile dall'elenco.";
  }

  if (!isOneOf(CAMPAIGN_STATUS_LABELS, raw.stato_campagna)) {
    errors.stato_campagna = "Scegli lo stato della campagna.";
  }

  const lat = coordinate(raw.lat, "lat", 90, errors);
  const lng = coordinate(raw.lng, "lng", 180, errors);
  if (!errors.lat && !errors.lng && (lat === null) !== (lng === null)) {
    errors[lat === null ? "lat" : "lng"] = "Inserisci sia la latitudine sia la longitudine, oppure nessuna delle due.";
  }

  if (Object.keys(errors).length > 0) return { values: null, errors };

  return {
    values: {
      nome: raw.nome,
      tipo: raw.tipo as FacilityValues["tipo"],
      indirizzo: raw.indirizzo,
      cap: optionalText(raw.cap),
      citta: raw.citta,
      capacita,
      posti_commerciali: postiCommerciali,
      raggio_m: raggio,
      responsabile_id: optionalText(raw.responsabile_id),
      stato_campagna: raw.stato_campagna as FacilityValues["stato_campagna"],
      note: optionalText(raw.note),
      lat,
      lng,
    },
    errors,
  };
}

// Address used for geocoding and to detect a change.
export function facilityAddress(parts: { indirizzo?: string | null; cap?: string | null; citta?: string | null }) {
  return [parts.indirizzo, [parts.cap, parts.citta].filter(Boolean).join(" ")]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export const PRODUCT_FIELDS = [
  "nome",
  "tipo",
  "giorni_preset",
  "giorni_personalizzati",
  "ora_da",
  "ora_a",
  "periodo",
  "prezzo_netto",
  "iva_pct",
  "posti_disponibili",
  "note",
  "attivo",
] as const;

export type ProductValues = Omit<TablesInsert<"parking_products">, "id" | "created_by" | "parking_id">;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const CUSTOM_DAYS = "personalizzati";

export function validateProduct(form: FormData): { values: ProductValues | null; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const raw = readRawValues(form, PRODUCT_FIELDS);

  if (raw.nome === "") errors.nome = "Inserisci il nome del prodotto.";
  else if (raw.nome.length > 120) errors.nome = "Il nome può avere al massimo 120 caratteri.";

  if (!isOneOf(PRODUCT_TYPE_LABELS, raw.tipo)) errors.tipo = "Scegli il tipo di prodotto.";

  let giorni: string | null = null;
  if (raw.giorni_preset === CUSTOM_DAYS) {
    if (raw.giorni_personalizzati === "") errors.giorni_personalizzati = "Descrivi i giorni, per esempio 6/7.";
    else giorni = raw.giorni_personalizzati.slice(0, 40);
  } else if ((DAY_PRESETS as readonly string[]).includes(raw.giorni_preset)) {
    giorni = raw.giorni_preset;
  } else if (raw.giorni_preset !== "") {
    errors.giorni_preset = "Scegli i giorni dall'elenco.";
  }

  if (raw.ora_da !== "" && !TIME.test(raw.ora_da)) errors.ora_da = "Usa il formato hh:mm.";
  if (raw.ora_a !== "" && !TIME.test(raw.ora_a)) errors.ora_a = "Usa il formato hh:mm.";
  if (!errors.ora_da && !errors.ora_a && (raw.ora_da === "") !== (raw.ora_a === "")) {
    errors[raw.ora_da === "" ? "ora_da" : "ora_a"] = "Inserisci entrambi gli orari, oppure lasciali vuoti per tutto il giorno.";
  }

  if (raw.periodo !== "" && !isOneOf(PRODUCT_PERIOD_LABELS, raw.periodo)) errors.periodo = "Scegli il periodo.";

  const prezzo = parseDecimal(raw.prezzo_netto);
  if (prezzo !== null && (Number.isNaN(prezzo) || prezzo < 0 || prezzo > 99_999_999)) {
    errors.prezzo_netto = "Inserisci un importo valido, per esempio 120,50.";
  } else if (prezzo !== null && Math.abs(Math.round(prezzo * 100) - prezzo * 100) > 1e-6) {
    errors.prezzo_netto = "Al massimo due decimali.";
  }

  const iva = raw.iva_pct === "" ? DEFAULT_VAT_PCT : parseDecimal(raw.iva_pct);
  if (iva === null || Number.isNaN(iva) || iva < 0 || iva > 100) {
    errors.iva_pct = "Inserisci una percentuale tra 0 e 100.";
  }

  const posti = wholeNumber(raw.posti_disponibili, "posti_disponibili", errors);

  if (Object.keys(errors).length > 0) return { values: null, errors };

  return {
    values: {
      nome: raw.nome,
      tipo: raw.tipo as ProductValues["tipo"],
      giorni,
      ora_da: optionalText(raw.ora_da),
      ora_a: optionalText(raw.ora_a),
      periodo: raw.periodo === "" ? null : (raw.periodo as ProductValues["periodo"]),
      prezzo_netto: prezzo,
      iva_pct: iva,
      posti_disponibili: posti,
      note: optionalText(raw.note),
      attivo: raw.attivo === "on",
    },
    errors,
  };
}

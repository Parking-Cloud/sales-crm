import type { FieldErrors, RawValues } from "@/lib/parking/validation";
import {
  CONTACT_CHANNEL_LABELS,
  DATA_STATUS_LABELS,
  PARTY_TYPE_LABELS,
  PRIVATE_PARKING_LABELS,
  isPartyCategory,
  type ContactChannel,
  type DataStatus,
  type PartyType,
  type PrivateParking,
} from "./labels";
import { isOneOf } from "@/lib/parking/labels";

// Server-side validation of party, location and contact forms. The database
// normalizes phones, emails, domains and VAT numbers (see the 1a-3
// migrations); here we only reject what cannot be normalized, with messages
// shown under each field.

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function readRaw(form: FormData, fields: readonly string[]): RawValues {
  return Object.fromEntries(fields.map((name) => [name, text(form, name)]));
}

const optional = (value: string) => (value === "" ? null : value);

// Same rule as public.is_valid_email.
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;

export function emailError(raw: string): string | null {
  if (raw === "") return null;
  if (!raw.includes("@")) {
    return "Non è un indirizzo email. Se l'azienda si contatta solo dal sito, usa il campo “Form sul sito”.";
  }
  return EMAIL.test(raw.toLowerCase()) ? null : "Indirizzo email non valido.";
}

const PHONE_SEPARATORS = /,|;|\/\//;

function phoneDigits(raw: string): string {
  return raw.replace(/[\s.\-/()+]/g, "");
}

export function phoneError(raw: string, { allowMany = false } = {}): string | null {
  if (raw === "") return null;
  const parts = raw.split(PHONE_SEPARATORS).map((part) => part.trim()).filter(Boolean);
  if (!allowMany && parts.length > 1) {
    return "Un solo numero per il prospect: aggiungi gli altri nei contatti.";
  }
  for (const part of parts) {
    const digits = phoneDigits(part);
    if (!/^\d{6,15}$/.test(digits)) return "Numero di telefono non valido.";
  }
  return null;
}

// Same rule as public.normalize_domain, to tell the user before saving.
export function domainOf(site: string): string | null {
  let host = site.trim().toLowerCase();
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^[^/@]*@/, "");
  host = host.split("/")[0].split("?")[0].split("#")[0].split(":")[0].replace(/^www\./, "").replace(/\.$/, "");
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) ? host : null;
}

function urlError(raw: string): string | null {
  if (raw === "") return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? null : "Inserisci un indirizzo che inizia con https://";
  } catch {
    return "Inserisci l'indirizzo completo della pagina, per esempio https://www.esempio.it/contatti";
  }
}

// ---------------------------------------------------------------------------
// Provenance (CRM-09)
// ---------------------------------------------------------------------------

// Party fields with tracked provenance (same list as public.party_tracked_fields).
export const PARTY_TRACKED_FIELDS = ["telefono", "email", "sito", "dipendenti_stimati", "parcheggio_privato"] as const;
export type TrackedField = (typeof PARTY_TRACKED_FIELDS)[number] | "referente";

export const TRACKED_FIELD_LABELS: Record<TrackedField, string> = {
  telefono: "Telefono",
  email: "Email",
  sito: "Sito",
  dipendenti_stimati: "Dipendenti stimati",
  parcheggio_privato: "Parcheggio privato",
  referente: "Referente",
};

export type ProvenanceInput = { campo: TrackedField; stato: DataStatus; fonteId: string | null };

export function readProvenance(form: FormData, field: TrackedField, sourceIds: Set<string>): ProvenanceInput {
  const stato = text(form, `prov_${field}_stato`);
  const fonte = text(form, `prov_${field}_fonte`);
  return {
    campo: field,
    stato: isOneOf(DATA_STATUS_LABELS, stato) ? stato : "da_verificare",
    fonteId: sourceIds.has(fonte) ? fonte : null,
  };
}

// ---------------------------------------------------------------------------
// Party
// ---------------------------------------------------------------------------

export const PARTY_FIELDS = [
  "tipo",
  "denominazione",
  "nome",
  "cognome",
  "categoria",
  "piva",
  "codice_fiscale",
  "sito",
  "telefono",
  "email",
  "form_web_url",
  "dipendenti_stimati",
  "parcheggio_privato",
  "indirizzo",
  "cap",
  "citta",
  // New party only: car park of interest (block 1a-7, A2).
  "parcheggio_interesse",
  "origine",
  "fase_iniziale",
] as const;

export type PartyValues = {
  tipo: PartyType;
  denominazione: string | null;
  nome: string | null;
  cognome: string | null;
  categoria: string | null;
  piva: string | null;
  codice_fiscale: string | null;
  sito: string | null;
  telefono: string | null;
  email: string | null;
  form_web_url: string | null;
  dipendenti_stimati: number | null;
  parcheggio_privato: PrivateParking;
};

export type MainLocation = { indirizzo: string | null; cap: string | null; citta: string | null };

export function validateParty(form: FormData): {
  values: PartyValues | null;
  location: MainLocation;
  errors: FieldErrors;
} {
  const errors: FieldErrors = {};
  const raw = readRaw(form, PARTY_FIELDS);
  const tipo = raw.tipo;
  if (!isOneOf(PARTY_TYPE_LABELS, tipo)) errors.tipo = "Scegli azienda o persona.";
  const isCompany = tipo === "azienda";

  if (isCompany) {
    if (raw.denominazione === "") errors.denominazione = "Inserisci la denominazione.";
    else if (raw.denominazione.length > 200) errors.denominazione = "Al massimo 200 caratteri.";
  } else if (tipo === "persona" && raw.nome === "" && raw.cognome === "") {
    errors.cognome = "Inserisci almeno il nome o il cognome.";
  }

  if (raw.categoria !== "" && !isPartyCategory(raw.categoria)) errors.categoria = "Scegli una categoria dall'elenco.";

  const piva = raw.piva.replace(/[\s.]/g, "").toUpperCase().replace(/^IT(\d{11})$/, "$1");
  if (piva !== "" && !/^(\d{11}|[A-Z]{2}[A-Z0-9]{2,13})$/.test(piva)) {
    errors.piva = "La partita IVA italiana ha 11 cifre.";
  }
  const cf = raw.codice_fiscale.replace(/\s/g, "").toUpperCase();
  if (cf !== "" && !/^([A-Z0-9]{16}|\d{11})$/.test(cf)) errors.codice_fiscale = "Il codice fiscale ha 16 caratteri (11 cifre per le società).";

  if (raw.sito !== "" && !domainOf(raw.sito)) errors.sito = "Indirizzo del sito non valido, per esempio www.esempio.it";
  const phone = phoneError(raw.telefono);
  if (phone) errors.telefono = phone;
  const email = emailError(raw.email);
  if (email) errors.email = email;
  const formUrl = urlError(raw.form_web_url);
  if (formUrl) errors.form_web_url = formUrl;

  let employees: number | null = null;
  if (raw.dipendenti_stimati !== "") {
    const value = Number(raw.dipendenti_stimati.replace(/\./g, ""));
    if (!Number.isInteger(value) || value < 0 || value > 1_000_000) errors.dipendenti_stimati = "Inserisci un numero intero.";
    else employees = value;
  }
  const parking = raw.parcheggio_privato === "" ? "non_noto" : raw.parcheggio_privato;
  if (!isOneOf(PRIVATE_PARKING_LABELS, parking)) errors.parcheggio_privato = "Scegli un valore dall'elenco.";

  if (raw.cap !== "" && !/^\d{5}$/.test(raw.cap)) errors.cap = "Il CAP ha 5 cifre.";

  const location = { indirizzo: optional(raw.indirizzo), cap: optional(raw.cap), citta: optional(raw.citta) };
  if (Object.keys(errors).length > 0) return { values: null, location, errors };

  return {
    values: {
      tipo: tipo as PartyType,
      denominazione: isCompany ? raw.denominazione : null,
      nome: isCompany ? null : optional(raw.nome),
      cognome: isCompany ? null : optional(raw.cognome),
      categoria: optional(raw.categoria),
      piva: isCompany ? optional(piva) : null,
      codice_fiscale: optional(cf),
      sito: optional(raw.sito),
      telefono: optional(raw.telefono),
      email: optional(raw.email.toLowerCase()),
      form_web_url: optional(raw.form_web_url),
      dipendenti_stimati: employees,
      parcheggio_privato: parking as PrivateParking,
    },
    location,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

export const LOCATION_FIELDS = ["indirizzo", "cap", "citta", "lat", "lng", "principale"] as const;

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

export const CONTACT_FIELDS = ["nome", "cognome", "ruolo", "email", "telefono", "canale_preferito"] as const;

export type ContactValues = {
  nome: string | null;
  cognome: string | null;
  ruolo: string | null;
  email: string | null;
  telefono: string | null;
  canale_preferito: ContactChannel | null;
};

export function validateContact(form: FormData): { values: ContactValues | null; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const raw = readRaw(form, CONTACT_FIELDS);
  if (raw.nome === "" && raw.cognome === "" && raw.ruolo === "") {
    errors.nome = "Inserisci almeno il nome, il cognome o il ruolo.";
  }
  const email = emailError(raw.email);
  if (email) errors.email = email;
  const phone = phoneError(raw.telefono, { allowMany: true });
  if (phone) errors.telefono = phone;
  if (raw.canale_preferito !== "" && !isOneOf(CONTACT_CHANNEL_LABELS, raw.canale_preferito)) {
    errors.canale_preferito = "Scegli un canale dall'elenco.";
  }
  if (Object.keys(errors).length > 0) return { values: null, errors };
  return {
    values: {
      nome: optional(raw.nome),
      cognome: optional(raw.cognome),
      ruolo: optional(raw.ruolo),
      email: optional(raw.email.toLowerCase()),
      telefono: optional(raw.telefono),
      canale_preferito: raw.canale_preferito === "" ? null : (raw.canale_preferito as ContactChannel),
    },
    errors,
  };
}

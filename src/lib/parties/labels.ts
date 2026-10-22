import type { Database } from "../supabase/types";

type Enums = Database["public"]["Enums"];
export type PartyType = Enums["party_type"];
export type DataStatus = Enums["data_status"];
export type PrivateParking = Enums["private_parking"];
export type ContactChannel = Enums["contact_channel"];

export const PARTY_TYPE_LABELS: Record<PartyType, string> = {
  azienda: "Azienda",
  persona: "Persona",
};

// Party categories: the only list, used by forms, filters and validation.
// The column is free text in the schema, so the list is enforced here.
// The map search categories (lib/places/categories) are all here, plus
// "Aziende" (older data) and "Altro".
export const PARTY_CATEGORIES = [
  "Uffici",
  "Sedi aziendali",
  "Aziende",
  "Studi professionali",
  "Banche e assicurazioni",
  "Uffici pubblici",
  "Ospedali e cliniche",
  "Centri medici",
  "Università e scuole",
  "Musei e cultura",
  "Centri congressi ed eventi",
  "Hotel",
  "Strutture ricettive",
  "Ristoranti",
  "Negozi",
  "Centri commerciali e supermercati",
  "Concessionarie",
  "Palestre",
  "Altro",
] as const;
export type PartyCategory = (typeof PARTY_CATEGORIES)[number];

export function isPartyCategory(value: unknown): value is PartyCategory {
  return typeof value === "string" && (PARTY_CATEGORIES as readonly string[]).includes(value);
}

export const PRIVATE_PARKING_LABELS: Record<PrivateParking, string> = {
  si: "Sì",
  no: "No",
  non_noto: "Non noto",
};

export const CONTACT_CHANNEL_LABELS: Record<ContactChannel, string> = {
  telefono: "Telefono",
  email: "Email",
  form_web: "Form sul sito",
};

export const DATA_STATUS_LABELS: Record<DataStatus, string> = {
  verificato: "Verificato",
  stimato: "Stimato",
  da_verificare: "Da verificare",
};

// Display name of a party: company name, or first and last name.
export function partyName(party: {
  denominazione: string | null;
  nome: string | null;
  cognome: string | null;
}): string {
  const company = party.denominazione?.trim();
  if (company) return company;
  return [party.nome, party.cognome].filter(Boolean).join(" ").trim() || "Senza nome";
}

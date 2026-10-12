import type { BadgeTone } from "@/components/ui/badge";
import type { Database } from "@/lib/supabase/types";

type Enums = Database["public"]["Enums"];
export type ParkingType = Enums["parking_type"];
export type CampaignStatus = Enums["campaign_status"];
export type ProductType = Enums["product_type"];
export type ProductPeriod = Enums["product_period"];

export const PARKING_TYPE_LABELS: Record<ParkingType, string> = {
  autorimessa: "Autorimessa",
  aziendale: "Aziendale",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  bozza: "Bozza",
  attiva: "Attiva",
  in_pausa: "In pausa",
  chiusa: "Chiusa",
};

export const CAMPAIGN_STATUS_TONES: Record<CampaignStatus, BadgeTone> = {
  bozza: "neutral",
  attiva: "success",
  in_pausa: "attention",
  chiusa: "neutral",
};

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  abbonamento: "Abbonamento",
  sosta_breve: "Sosta breve",
  carnet: "Carnet",
  convenzione: "Convenzione con codice sconto",
  servizio_aggiuntivo: "Servizio aggiuntivo",
};

export const PRODUCT_PERIOD_LABELS: Record<ProductPeriod, string> = {
  ora: "Ora",
  giorno: "Giorno",
  mese: "Mese",
  anno: "Anno",
};

// Day patterns offered in the product form; anything else is free text.
export const DAY_PRESETS = ["5/7", "7/7"] as const;

export const DEFAULT_SEARCH_RADIUS_M = 500;
export const DEFAULT_VAT_PCT = 22;

export function isOneOf<T extends string>(labels: Record<T, string>, value: unknown): value is T {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(labels, value);
}

// "07:00:00" -> "07:00"; empty band means the whole day.
export function formatTimeBand(from: string | null, to: string | null): string {
  if (!from && !to) return "Tutto il giorno";
  return `${from?.slice(0, 5) ?? "–"}–${to?.slice(0, 5) ?? "–"}`;
}

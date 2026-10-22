import type { Database } from "../supabase/types";
import { LOSS_REASONS, LOSS_REASON_LABELS, type LossReasonKey } from "../pipeline/labels";

// Statuses of the prospect model (spec "Revisione 22/10/2026"): the status of
// a prospect and the offer of a pipeline row. Badges always carry the text;
// the tone only reinforces it (grey, light blue, green, red). Pure: unit
// tested.

type Enums = Database["public"]["Enums"];
export type ProspectStatus = Enums["prospect_status"];
export type OfferStatus = Enums["pipeline_offer_status"];
export type StatusTone = "neutral" | "info" | "success" | "critical";

export const PROSPECT_STATUSES: readonly ProspectStatus[] = ["da_contattare", "interessato", "molto_interessato", "non_interessato"];
export const PROSPECT_STATUS_LABELS: Record<ProspectStatus, string> = {
  da_contattare: "Da contattare",
  interessato: "Interessato",
  molto_interessato: "Molto interessato",
  non_interessato: "Non interessato",
};
export const PROSPECT_STATUS_TONES: Record<ProspectStatus, StatusTone> = {
  da_contattare: "neutral",
  interessato: "info",
  molto_interessato: "success",
  non_interessato: "critical",
};

export const OFFER_STATUSES: readonly OfferStatus[] = ["da_inviare", "inviata", "accettata", "rifiutata"];
export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  da_inviare: "Offerta da inviare",
  inviata: "Offerta inviata",
  accettata: "Accettata",
  rifiutata: "Rifiutata",
};
export const OFFER_STATUS_TONES: Record<OfferStatus, StatusTone> = {
  da_inviare: "neutral",
  inviata: "info",
  accettata: "success",
  rifiutata: "critical",
};

// Leads: prospects that enter the pipeline.
export function isLead(status: ProspectStatus): boolean {
  return status === "interessato" || status === "molto_interessato";
}

export function isProspectStatus(value: unknown): value is ProspectStatus {
  return typeof value === "string" && (PROSPECT_STATUSES as readonly string[]).includes(value);
}

export function isOfferStatus(value: unknown): value is OfferStatus {
  return typeof value === "string" && (OFFER_STATUSES as readonly string[]).includes(value);
}

// Reasons offered for "Non interessato" and "Rifiutata" (optional).
export const REASON_CHOICES: readonly LossReasonKey[] = LOSS_REASONS;

export function isReasonChoice(value: unknown): value is (typeof LOSS_REASONS)[number] {
  return typeof value === "string" && (LOSS_REASONS as readonly string[]).includes(value);
}

export function reasonLabel(reason: string | null | undefined): string | null {
  if (!reason || reason === "non_indicato") return null;
  return LOSS_REASON_LABELS[reason as LossReasonKey] ?? null;
}

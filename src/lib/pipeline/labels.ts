// Labels of the pipeline: stages (spec "Fasi dell'opportunità"), outcomes,
// loss reasons (CRM-17), call outcomes (CRM-18). Pure: unit tested.
// Same tones as the UI Kit badge (components/ui/badge).
type BadgeTone = "info" | "attention" | "success" | "critical" | "neutral";

export const STAGES = [
  "individuata",
  "da_contattare",
  "contattata",
  "interessata",
  "offerta_inviata",
  "vinta",
  "passata_bo",
  "attivata",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  individuata: "Individuata",
  da_contattare: "Da contattare",
  contattata: "Contattata",
  interessata: "Interessata",
  offerta_inviata: "Offerta inviata",
  vinta: "Vinta",
  passata_bo: "Passata al BO",
  attivata: "Attivata",
};

// Set by hand in phase 1a: from "Individuata" to "Vinta". The last two come
// with the backoffice handoff (phase 1b).
export const MANUAL_STAGES: readonly Stage[] = STAGES.slice(0, 6);
export const HANDOFF_STAGE_NOTE = "Arriva con il passaggio al backoffice (fase 1b): non si imposta a mano.";

export function isManualStage(value: unknown): value is Stage {
  return typeof value === "string" && (MANUAL_STAGES as readonly string[]).includes(value);
}

export const OUTCOMES = ["aperta", "vinta", "persa"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export const OUTCOME_LABELS: Record<Outcome, string> = { aperta: "Aperta", vinta: "Vinta", persa: "Persa" };

// Badge of an opportunity: the stage while open, the outcome when closed.
export function opportunityBadge(fase: Stage, esito: Outcome): { label: string; tone: BadgeTone } {
  if (esito === "persa") return { label: "Persa", tone: "neutral" };
  if (esito === "vinta" || fase === "vinta") return { label: "Vinta", tone: "success" };
  if (fase === "passata_bo" || fase === "attivata") return { label: STAGE_LABELS[fase], tone: "success" };
  if (fase === "individuata" || fase === "da_contattare") return { label: STAGE_LABELS[fase], tone: "neutral" };
  return { label: STAGE_LABELS[fase], tone: "info" };
}

export const LOSS_REASONS = [
  "mezzi_pubblici",
  "ha_gia_parcheggio",
  "trasloco",
  "prezzo",
  "nessun_bisogno",
  "non_raggiungibile",
  "altro",
] as const;
export type LossReasonKey = (typeof LOSS_REASONS)[number];
export const LOSS_REASON_LABELS: Record<LossReasonKey, string> = {
  mezzi_pubblici: "Usa i mezzi pubblici",
  ha_gia_parcheggio: "Ha già un parcheggio",
  trasloco: "Trasloco",
  prezzo: "Prezzo",
  nessun_bisogno: "Nessun bisogno",
  non_raggiungibile: "Non raggiungibile",
  altro: "Altro",
};

export const CALL_OUTCOMES = ["risposto", "non_risponde", "numero_errato", "richiamare"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];
export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  risposto: "Risposto",
  non_risponde: "Non risponde",
  numero_errato: "Numero errato",
  richiamare: "Richiamare",
};

export const ACTIVITY_TYPES = ["chiamata", "email", "incontro", "nota"] as const;
export type ActivityKind = (typeof ACTIVITY_TYPES)[number];
export const ACTIVITY_LABELS: Record<ActivityKind | "cambio_fase", string> = {
  chiamata: "Chiamata",
  email: "Email",
  incontro: "Incontro",
  nota: "Nota",
  cambio_fase: "Cambio di fase",
};

// Suppression list ("lista di esclusione", block 1a-7): kinds of value and
// the channel an opposition came from. Pure.

export const SUPPRESSION_TYPES = ["email", "telefono", "dominio", "piva", "place_id"] as const;
export type SuppressionType = (typeof SUPPRESSION_TYPES)[number];
export const SUPPRESSION_TYPE_LABELS: Record<SuppressionType, string> = {
  email: "Email",
  telefono: "Telefono",
  dominio: "Dominio",
  piva: "Partita IVA",
  place_id: "Luogo Google",
};

export const OPPOSITION_CHANNELS = ["telefono", "email", "di_persona", "posta", "altro"] as const;
export type OppositionChannel = (typeof OPPOSITION_CHANNELS)[number];
export const OPPOSITION_CHANNEL_LABELS: Record<OppositionChannel, string> = {
  telefono: "Telefono",
  email: "Email",
  di_persona: "Di persona",
  posta: "Posta",
  altro: "Altro",
};

export function isOppositionChannel(value: unknown): value is OppositionChannel {
  return typeof value === "string" && (OPPOSITION_CHANNELS as readonly string[]).includes(value);
}

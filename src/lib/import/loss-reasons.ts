// Loss reason (opportunities.motivo_perdita) deduced from free notes.
// Order matters: the first matching rule wins; "altro" otherwise.

export type LossReason = "mezzi_pubblici" | "ha_gia_parcheggio" | "trasloco" | "prezzo" | "nessun_bisogno" | "altro";

const RULES: { reason: LossReason; pattern: RegExp }[] = [
  { reason: "mezzi_pubblici", pattern: /mezzi( pubblici)?|metro(politana)?|\btreno|\bautobus|\btram\b|in bici|a piedi/i },
  { reason: "ha_gia_parcheggio", pattern: /(gi[aà]|hanno|ha)\s+(un |il )?(parcheggio|posto auto|garage|box)|parcheggio (interno|aziendale|privato|proprio)|posti auto propri/i },
  { reason: "trasloco", pattern: /trasl(oc|ocano|ocheranno|ocato)|trasferi(sc|ment|t)|cambiano sede|chiud(e|ono) (la )?sede/i },
  { reason: "prezzo", pattern: /prezz|costo|caro|cari\b|tariff|budget|economic/i },
  { reason: "nessun_bisogno", pattern: /non (ne )?(hanno|ha) (più |piu )?bisogno|nessun(a)? (esigenza|bisogno|interesse)|non interessat|non serve|non necessari/i },
];

export function lossReasonFor(...texts: (string | null | undefined)[]): LossReason {
  const text = texts.filter(Boolean).join(" ");
  for (const rule of RULES) {
    if (rule.pattern.test(text)) return rule.reason;
  }
  return "altro";
}

// Rejected offers: "prezzo" when the feedback mentions price or rates.
export function offerRejectionReason(feedback: string | null): LossReason {
  if (feedback && /prezz|tariff|costo|caro/i.test(feedback)) return "prezzo";
  return lossReasonFor(feedback);
}

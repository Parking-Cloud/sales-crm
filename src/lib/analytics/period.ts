import { addDays } from "../pipeline/dates";

// Periods of the Analytics page (block 1a-10), as Rome calendar days.
// Pure: unit tested.

export const PERIOD_PRESETS = {
  questo_mese: "Questo mese",
  mese_scorso: "Mese scorso",
  ultimi_90: "Ultimi 90 giorni",
  personalizzato: "Personalizzato",
} as const;

export type PeriodPreset = keyof typeof PERIOD_PRESETS;

// Longest custom period, so a typo in the year cannot load years of audit.
export const MAX_PERIOD_DAYS = 731;

export type Period = { preset: PeriodPreset; da: string; a: string; error: string | null };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isDay(value: string | undefined): value is string {
  if (!value || !DAY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function daysBetween(da: string, a: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${da}T00:00:00Z`)) / 86_400_000);
}

// "today" is the Rome day (romeDay(new Date())). A preset period ends today;
// "mese scorso" is the whole previous month.
export function presetPeriod(preset: Exclude<PeriodPreset, "personalizzato">, today: string): { da: string; a: string } {
  const monthStart = `${today.slice(0, 7)}-01`;
  if (preset === "questo_mese") return { da: monthStart, a: today };
  if (preset === "ultimi_90") return { da: addDays(today, -89), a: today };
  const lastMonthEnd = addDays(monthStart, -1);
  return { da: `${lastMonthEnd.slice(0, 7)}-01`, a: lastMonthEnd };
}

// Period from the URL (?periodo=&da=&a=). A custom period with wrong dates
// falls back to this month and says why.
export function readPeriod(params: { periodo?: string; da?: string; a?: string }, today: string): Period {
  const preset = params.periodo && params.periodo in PERIOD_PRESETS ? (params.periodo as PeriodPreset) : "questo_mese";
  if (preset !== "personalizzato") return { preset, ...presetPeriod(preset, today), error: null };
  const fallback = (error: string): Period => ({ preset, ...presetPeriod("questo_mese", today), error });
  if (!isDay(params.da) || !isDay(params.a)) return fallback("Indica le date di inizio e di fine del periodo.");
  if (params.da > params.a) return fallback("La data di inizio è dopo la data di fine.");
  if (daysBetween(params.da, params.a) >= MAX_PERIOD_DAYS) return fallback("Il periodo può durare al massimo due anni.");
  return { preset, da: params.da, a: params.a, error: null };
}

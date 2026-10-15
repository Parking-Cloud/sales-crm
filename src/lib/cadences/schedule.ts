// Light cadences (block 1a-8): working days, step labels, statistics.
// Same rules as public.add_business_days and public.cadence_step_due.
// Pure: unit tested. Relative imports only.
import { addDays, romeInstant } from "../pipeline/dates";

// 1 = Monday ... 7 = Sunday, for a "yyyy-mm-dd" day.
function isoWeekday(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

// day plus n working days (Monday to Friday); a weekend result moves to
// Monday, so 0 days from a Saturday is the next Monday. No holidays.
export function addBusinessDays(day: string, days: number): string {
  let current = day;
  while (isoWeekday(current) > 5) current = addDays(current, 1);
  let left = Math.max(0, Math.floor(days));
  while (left > 0) {
    current = addDays(current, 1);
    if (isoWeekday(current) <= 5) left -= 1;
  }
  return current;
}

// Due time of a step: n working days after day, at the suggested time
// (09:00 when none), Europe/Rome.
export function stepDue(day: string, wait: number, time: string | null): Date {
  return romeInstant(addBusinessDays(day, wait), (time ?? "09:00").slice(0, 5));
}

export const STEP_TYPES = ["chiamata", "email", "attivita"] as const;
export type StepType = (typeof STEP_TYPES)[number];
export const STEP_TYPE_LABELS: Record<StepType, string> = { chiamata: "Chiamata", email: "Email", attivita: "Attività" };

export const ENROLLMENT_STATES = ["attiva", "in_pausa", "completata", "fermata"] as const;
export type EnrollmentState = (typeof ENROLLMENT_STATES)[number];
export const ENROLLMENT_STATE_LABELS: Record<EnrollmentState, string> = {
  attiva: "Attiva",
  in_pausa: "In pausa",
  completata: "Completata",
  fermata: "Fermata",
};

export type StopOutcome = "risposto" | "convertito" | "chiusa" | "non_contattare" | "manuale";

export type CadenceStats = { attivi: number; inPausa: number; fermati: number; risposto: number; convertiti: number; completati: number };

// Statistics of a cadence from its enrollments: "risposto" and "convertiti"
// are stopped enrollments with that outcome; "fermati" are all stopped ones.
export function cadenceStats(enrollments: { stato: EnrollmentState; esito: StopOutcome | null }[]): CadenceStats {
  const stats: CadenceStats = { attivi: 0, inPausa: 0, fermati: 0, risposto: 0, convertiti: 0, completati: 0 };
  for (const row of enrollments) {
    if (row.stato === "attiva") stats.attivi += 1;
    else if (row.stato === "in_pausa") stats.inPausa += 1;
    else if (row.stato === "completata") stats.completati += 1;
    else {
      stats.fermati += 1;
      if (row.esito === "risposto") stats.risposto += 1;
      if (row.esito === "convertito") stats.convertiti += 1;
    }
  }
  return stats;
}

// "+2 g. lav." / "subito" for the row of step icons.
export function waitLabel(days: number): string {
  if (days === 0) return "subito";
  return days === 1 ? "+1 giorno lav." : `+${days} giorni lav.`;
}

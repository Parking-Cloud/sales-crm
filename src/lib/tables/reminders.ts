// Reminder of a pipeline row: days from today (Europe/Rome) to the date,
// shown as "tra N giorni", "oggi" or "scaduto da N giorni".
// Green beyond 3 days, the UI Kit warning tone within 3 days and today,
// red when overdue. Pure: unit tested.

export type ReminderTone = "success" | "attention" | "critical";

// Days from one "yyyy-mm-dd" to another (calendar days, no time zone).
export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function reminderDue(days: number | null): { label: string; tone: ReminderTone } | null {
  if (days === null || !Number.isFinite(days)) return null;
  if (days < 0) return { label: days === -1 ? "scaduto da 1 giorno" : `scaduto da ${-days} giorni`, tone: "critical" };
  if (days === 0) return { label: "oggi", tone: "attention" };
  return { label: days === 1 ? "tra 1 giorno" : `tra ${days} giorni`, tone: days <= 3 ? "attention" : "success" };
}

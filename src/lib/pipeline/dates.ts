// Day boundaries in Europe/Rome, for "oggi", "scaduta", "entro 7 giorni".
// Pure: unit tested.

const PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

// Offset of Rome from UTC at an instant, in minutes (60 or 120).
function romeOffsetMinutes(at: Date): number {
  const p = Object.fromEntries(PARTS.formatToParts(at).map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((asUtc - at.getTime()) / 60_000);
}

// "yyyy-mm-dd" of an instant in Rome.
export function romeDay(at: Date): string {
  const p = Object.fromEntries(PARTS.formatToParts(at).map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

// Instant of a Rome local date and time ("2026-10-20", "09:00").
export function romeInstant(day: string, time = "00:00"): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm));
  const first = new Date(guess.getTime() - romeOffsetMinutes(guess) * 60_000);
  // Second pass for days when the offset changes (DST).
  return new Date(guess.getTime() - romeOffsetMinutes(first) * 60_000);
}

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

// Start of today, of tomorrow and of the day after the next 7 days (Rome).
export function dayBounds(now: Date): { today: Date; tomorrow: Date; week: Date } {
  const day = romeDay(now);
  return { today: romeInstant(day), tomorrow: romeInstant(addDays(day, 1)), week: romeInstant(addDays(day, 8)) };
}

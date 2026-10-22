import { addDays } from "../pipeline/dates";

// Analytics numbers (block 1a-10) from the events of analytics_events():
// one row per event and car park pair. Prospects count once (distinct
// prospects), offers once per pipeline row (distinct opportunities).
// Pure: unit tested.

export const EVENT_TYPES = ["contattato", "interessato", "inviata", "accettata", "rifiutata"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type AnalyticsEvent = {
  tipo: EventType;
  giorno: string;
  partyId: string;
  opportunityId: string | null;
  parkingId: string | null;
};

export type AnalyticsFilters = { parcheggio: string | null; citta: string | null; responsabile: string | null };

export type AnalyticsParking = { id: string; nome: string; citta: string | null };

export type Counts = Record<EventType, number>;

export const COUNT_LABELS: Record<EventType, string> = {
  contattato: "Prospect contattati",
  interessato: "Interessati e Molto interessati",
  inviata: "Offerte inviate",
  accettata: "Offerte accettate",
  rifiutata: "Offerte rifiutate",
};

// Column headings of the tables.
export const SHORT_LABELS: Record<EventType, string> = {
  contattato: "Contattati",
  interessato: "Interessati",
  inviata: "Inviate",
  accettata: "Accettate",
  rifiutata: "Rifiutate",
};

// Status changes shown week by week (contacts are a date, not a change).
export const TRANSITIONS = ["interessato", "inviata", "accettata", "rifiutata"] as const satisfies readonly EventType[];

export function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

const PROSPECT_EVENTS = new Set<EventType>(["contattato", "interessato"]);

// The key an event is counted by: the prospect, or the pipeline row.
function countKey(event: AnalyticsEvent): string {
  return PROSPECT_EVENTS.has(event.tipo) ? `p:${event.partyId}` : `o:${event.opportunityId}`;
}

export function countEvents(events: readonly AnalyticsEvent[]): Counts {
  const seen = Object.fromEntries(EVENT_TYPES.map((tipo) => [tipo, new Set<string>()])) as Record<EventType, Set<string>>;
  for (const event of events) seen[event.tipo].add(countKey(event));
  return Object.fromEntries(EVENT_TYPES.map((tipo) => [tipo, seen[tipo].size])) as Counts;
}

// Offers accepted in the period over offers sent in the period; null when
// none was sent (shown as "–", never as 0%).
export function acceptanceRate(counts: Counts): number | null {
  return counts.inviata > 0 ? counts.accettata / counts.inviata : null;
}

export type Week = { da: string; a: string; counts: Counts };

// Weeks from Monday to Sunday covering the period, the first and last cut to
// the period; every week is present, with zeros when nothing happened.
export function weeklyCounts(events: readonly AnalyticsEvent[], da: string, a: string): Week[] {
  const weekday = (new Date(`${da}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const weeks: Week[] = [];
  for (let start = addDays(da, -weekday); start <= a; start = addDays(start, 7)) {
    const end = addDays(start, 6);
    const from = start < da ? da : start;
    const to = end > a ? a : end;
    weeks.push({ da: from, a: to, counts: countEvents(events.filter((event) => event.giorno >= from && event.giorno <= to)) });
  }
  return weeks;
}

export type ParkingRow = { parkingId: string | null; nome: string; citta: string | null; counts: Counts; tasso: number | null };

// One row per car park with at least one event, by name; prospects without
// car parks last ("Senza parcheggio"). Car parks without events are not
// listed: their numbers are all zero.
export function parkingRows(
  events: readonly AnalyticsEvent[],
  parkings: readonly { id: string; nome: string; citta: string | null }[],
): ParkingRow[] {
  const groups = new Map<string | null, AnalyticsEvent[]>();
  for (const event of events) {
    const list = groups.get(event.parkingId) ?? [];
    list.push(event);
    groups.set(event.parkingId, list);
  }
  const byId = new Map(parkings.map((parking) => [parking.id, parking]));
  const rows = [...groups].map(([parkingId, list]): ParkingRow => {
    const parking = parkingId ? byId.get(parkingId) : undefined;
    const counts = countEvents(list);
    return {
      parkingId,
      nome: parkingId ? (parking?.nome ?? "Parcheggio non disponibile") : "Senza parcheggio",
      citta: parking?.citta ?? null,
      counts,
      tasso: acceptanceRate(counts),
    };
  });
  return rows.sort((x, y) => Number(x.parkingId === null) - Number(y.parkingId === null) || x.nome.localeCompare(y.nome, "it"));
}

// Cities of the car parks, once each (case and spaces ignored), by name.
export function parkingCities(parkings: readonly AnalyticsParking[]): string[] {
  const cities = new Map<string, string>();
  for (const parking of parkings) if (parking.citta && !cities.has(parking.citta.toLowerCase())) cities.set(parking.citta.toLowerCase(), parking.citta);
  return [...cities.values()].sort((x, y) => x.localeCompare(y, "it"));
}

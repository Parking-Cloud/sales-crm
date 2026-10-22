import { createClient } from "@/lib/supabase/server";
import { isEventType, type AnalyticsEvent, type AnalyticsFilters, type AnalyticsParking } from "./aggregate";

export type { AnalyticsFilters, AnalyticsParking } from "./aggregate";

// Reads of the Analytics page (block 1a-10), with the signed-in user's
// session (RLS).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The API returns at most 1000 rows per request: read in pages, up to a
// ceiling far above the events of a period.
const PAGE = 1000;
const MAX_ROWS = 200_000;

function fail(name: string, error: { code?: string; message: string }): never {
  throw new Error(`${name}: ${error.code ?? error.message}`);
}

export function readAnalyticsFilters(params: { parcheggio?: string; citta?: string; responsabile?: string }): AnalyticsFilters {
  return {
    parcheggio: params.parcheggio && UUID.test(params.parcheggio) ? params.parcheggio : null,
    citta: params.citta?.trim() ? params.citta.trim().slice(0, 120) : null,
    responsabile: params.responsabile && UUID.test(params.responsabile) ? params.responsabile : null,
  };
}

export async function listAnalyticsEvents(da: string, a: string, filters: AnalyticsFilters): Promise<AnalyticsEvent[]> {
  const supabase = await createClient();
  const events: AnalyticsEvent[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .rpc("analytics_events", {
        p_da: da,
        p_a: a,
        p_parcheggio: filters.parcheggio ?? undefined,
        p_citta: filters.citta ?? undefined,
        p_responsabile: filters.responsabile ?? undefined,
      })
      .order("giorno")
      .order("tipo")
      .order("party_id")
      .order("opportunity_id", { nullsFirst: true })
      .range(from, from + PAGE - 1);
    if (error) fail("analytics_events", error);
    for (const row of data) {
      if (isEventType(row.tipo)) {
        events.push({ tipo: row.tipo, giorno: row.giorno, partyId: row.party_id, opportunityId: row.opportunity_id, parkingId: row.parking_id });
      }
    }
    if (data.length < PAGE) break;
  }
  return events;
}

// Every car park (archived ones last, marked), for the filter and the table.
export async function listAnalyticsParkings(): Promise<AnalyticsParking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("parking_facilities").select("id, nome, nome_breve, citta, archived_at").order("nome");
  if (error) fail("parking_facilities", error);
  return [...data]
    .sort((x, y) => Number(x.archived_at !== null) - Number(y.archived_at !== null))
    .map((row) => ({ id: row.id, nome: (row.nome_breve ?? row.nome) + (row.archived_at ? " (archiviato)" : ""), citta: row.citta?.trim() || null }));
}

// Pipeline filters (CRM-16), kept in the URL. Pure: unit tested.
import { dayBounds } from "./dates";
import { STAGES, type Stage } from "./labels";

export type PipelineView = "kanban" | "tabella";
export type NextFilter = "scaduta" | "oggi" | "7giorni" | "nessuna";
export type OutcomeFilter = "aperte" | "vinte" | "perse" | "tutte";

export type PipelineFilters = {
  vista: PipelineView;
  parcheggio: string | null;
  // "mie" (default), "tutti" or a user id.
  responsabile: string;
  fase: Stage | null;
  esito: OutcomeFilter;
  prossima: NextFilter | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export function readPipelineFilters(params: Record<string, string | string[] | undefined>): PipelineFilters {
  const responsabile = one(params.responsabile);
  const fase = one(params.fase);
  const esito = one(params.esito);
  const prossima = one(params.prossima);
  const parcheggio = one(params.parcheggio);
  return {
    vista: one(params.vista) === "tabella" ? "tabella" : "kanban",
    parcheggio: UUID.test(parcheggio) ? parcheggio : null,
    responsabile: responsabile === "tutti" || UUID.test(responsabile) ? responsabile : "mie",
    fase: (STAGES as readonly string[]).includes(fase) ? (fase as Stage) : null,
    esito: esito === "vinte" || esito === "perse" || esito === "tutte" ? esito : "aperte",
    prossima: prossima === "scaduta" || prossima === "oggi" || prossima === "7giorni" || prossima === "nessuna" ? prossima : null,
  };
}

export function pipelineHref(filters: PipelineFilters, changes: Partial<PipelineFilters> = {}): string {
  const f = { ...filters, ...changes };
  const params = new URLSearchParams();
  if (f.vista !== "kanban") params.set("vista", f.vista);
  if (f.parcheggio) params.set("parcheggio", f.parcheggio);
  if (f.responsabile !== "mie") params.set("responsabile", f.responsabile);
  if (f.fase) params.set("fase", f.fase);
  if (f.esito !== "aperte") params.set("esito", f.esito);
  if (f.prossima) params.set("prossima", f.prossima);
  const query = params.toString();
  return query ? `/pipeline?${query}` : "/pipeline";
}

// Range of prossima_attivita_il for the "prossima attività" filter.
export function nextActivityRange(filter: NextFilter | null, now: Date): { from?: string; to?: string; none?: true } | null {
  if (!filter) return null;
  if (filter === "nessuna") return { none: true };
  const { today, tomorrow, week } = dayBounds(now);
  if (filter === "scaduta") return { to: now.toISOString() };
  if (filter === "oggi") return { from: today.toISOString(), to: tomorrow.toISOString() };
  return { from: now.toISOString(), to: week.toISOString() };
}

// URL parameters of the Prospect, Pipeline and Promemoria tables: filters,
// sort keys and the choices of the select filters. Pure: shared by the
// pages (server) and the tables (browser).

export const PROSPECT_FILTERS = ["stato", "parcheggio", "nome", "categoria", "telefono", "email", "contatto", "referente", "note"] as const;
export const PROSPECT_SORTS = ["stato", "parcheggio", "nome", "categoria", "telefono", "email", "ultimo_contatto", "referente", "note"] as const;
export const LAST_CONTACT_FILTERS = { mai: "Mai", settimana: "Ultimi 7 giorni", mese: "Ultimi 30 giorni", oltre_mese: "Più di 30 giorni fa" } as const;

export const PIPELINE_FILTERS = ["nome", "parcheggio", "responsabile", "telefono", "email", "referente", "offerta", "note", "promemoria"] as const;
export const PIPELINE_SORTS = ["nome", "parcheggio", "responsabile", "telefono", "email", "referente", "stato", "note", "promemoria"] as const;
export const REMINDER_FILTERS = ["parcheggio", "nome", "email", "telefono", "scadenza", "note"] as const;
export const REMINDER_SORTS = ["parcheggio", "nome", "email", "telefono", "promemoria", "note"] as const;
export const REMINDER_DUE_FILTERS = {
  scaduti: "Scaduti",
  entro3: "Oggi o entro 3 giorni",
  oltre3: "Oltre 3 giorni",
} as const;
// Active leads: the pipeline shows them unless the offer filter says
// otherwise ("tutti" = every status).
export const ACTIVE_OFFER_STATUSES = ["da_inviare", "inviata"] as const;
export const ALL_OFFERS = "tutti";

export const PIPELINE_REMINDER_FILTERS = { con: "Con promemoria", nessuno: "Senza promemoria", ...REMINDER_DUE_FILTERS } as const;

// How a party enters the pipeline by hand (block 1a-7, part A): car park of
// interest, origin of the lead and first stage. Pure: unit tested.
import { STAGE_LABELS, type Stage } from "./labels";

export const ORIGINS = ["contatto_in_entrata", "segnalazione", "altro"] as const;
export type Origin = (typeof ORIGINS)[number];
export const ORIGIN_LABELS: Record<Origin, string> = {
  contatto_in_entrata: "Contatto in entrata",
  segnalazione: "Segnalazione",
  altro: "Altro",
};

// Stages a new opportunity may start from.
export const ENTRY_STAGES = ["individuata", "da_contattare", "contattata", "interessata"] as const satisfies readonly Stage[];
export type EntryStage = (typeof ENTRY_STAGES)[number];
export const ENTRY_STAGE_OPTIONS = ENTRY_STAGES.map((stage) => ({ value: stage, label: STAGE_LABELS[stage] }));

// Someone who got in touch first is already interested; the rest starts at
// the beginning. Only a proposal: the user can change it.
export function defaultStageFor(origine: Origin | null): EntryStage {
  return origine === "contatto_in_entrata" ? "interessata" : "individuata";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PipelineEntry = { parkingId: string; origine: Origin | null; fase: EntryStage };

// Reads the optional "Parcheggio di interesse" block of the new-party form:
// null when no car park is chosen, an error for invalid values.
export function readPipelineEntry(raw: {
  parcheggio_interesse?: string;
  origine?: string;
  fase_iniziale?: string;
}): { entry: PipelineEntry | null; errors: Record<string, string> } {
  const parkingId = (raw.parcheggio_interesse ?? "").trim();
  if (!parkingId) return { entry: null, errors: {} };
  const errors: Record<string, string> = {};
  if (!UUID.test(parkingId)) errors.parcheggio_interesse = "Scegli un parcheggio dall'elenco.";
  const origineRaw = (raw.origine ?? "").trim();
  const origine = origineRaw === "" ? null : (ORIGINS as readonly string[]).includes(origineRaw) ? (origineRaw as Origin) : undefined;
  if (origine === undefined) errors.origine = "Scegli l'origine dall'elenco.";
  const faseRaw = (raw.fase_iniziale ?? "").trim();
  const fase = faseRaw === "" ? defaultStageFor(origine ?? null) : (ENTRY_STAGES as readonly string[]).includes(faseRaw) ? (faseRaw as EntryStage) : undefined;
  if (fase === undefined) errors.fase_iniziale = "Scegli una fase iniziale dall'elenco.";
  if (Object.keys(errors).length > 0) return { entry: null, errors };
  return { entry: { parkingId, origine: origine ?? null, fase: fase as EntryStage }, errors };
}

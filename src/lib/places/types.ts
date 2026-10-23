// Shapes exchanged between the map search page and its server actions.
// Results live only in the page (browser memory): nothing is saved unless
// imported.
import type { SearchCategory } from "./categories";

export type ResultStatus = "nuovo" | "presente" | "esclusione";

export type SearchResult = {
  placeId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  distance: number;
  category: SearchCategory | "Altro";
  status: ResultStatus;
  // The party found in the CRM, when there is one.
  partyId: string | null;
  partyName: string | null;
  reason: string | null;
};

export type SearchResponse = {
  center: { lat: number; lng: number };
  radius: number;
  parkingId: string;
  parkingName: string;
  categories: SearchCategory[];
  // Keyword of a Text Search, when used.
  keyword: string | null;
  results: SearchResult[];
  calls: number;
  partial: boolean;
};

export type WalkingDistance = { placeId: string; meters: number | null; minutes: number | null };

export type DuplicateCandidate = { partyId: string; name: string; reason: string };

// One chosen result after Place Details, with what the duplicate check found.
export type ImportCandidate = {
  placeId: string;
  name: string;
  category: SearchCategory | "Altro";
  telefono: string | null;
  sito: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
  lat: number;
  lng: number;
  // blocco: skipped; avviso: the user chooses; nuovo: created; sparito: the
  // place no longer exists on Google.
  check: "nuovo" | "avviso" | "blocco" | "sparito";
  reason: string | null;
  candidates: DuplicateCandidate[];
};

export type ImportChoice = { placeId: string; scelta: "crea" | "unisci" | null; unisciA: string | null };

export type ImportOutcome = {
  placeId: string;
  name: string;
  esito: "creato" | "aggiunto" | "saltato" | "da_decidere";
  reason: string | null;
  partyId: string | null;
};

export type ImportSummary = { creati: number; aggiunti: number; saltati: number; righe: ImportOutcome[] };

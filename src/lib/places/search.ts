// Search over an area with the 20-results limit of Places API (New):
// Nearby Search (one request per category, `query` = its types) or Text
// Search (`query` = the keyword). A circle that returns 20 results is split into
// 4 smaller circles and searched again, down to 3 levels and at most 60
// requests per search. Results are deduplicated by place id, those outside
// the requested radius dropped, and the distance is ours (straight line).
// The Google call and the quota check are passed in: pure, unit tested with
// fake answers.

import { distanceMeters, splitCircle, type Circle, type LatLng } from "./geo";

export const MAX_RESULTS_PER_CALL = 20;
export const MAX_LEVELS = 3;
export const MAX_CALLS = 60;
const PARALLEL = 8;

export type NearbyPlace = {
  id: string;
  name: string;
  address: string | null;
  location: LatLng;
  types: string[];
  primaryType: string | null;
};

export type NearbyCall<Q = readonly string[]> = (circle: Circle, query: Q) => Promise<NearbyPlace[]>;
// Reserves n requests on the daily limit; false when over it.
export type Reserve = (n: number) => Promise<boolean>;

export type AreaResult = {
  places: (NearbyPlace & { distance: number })[];
  calls: number;
  // Some circle still had 20 results at the last level, or the 60 requests
  // were used up: there may be more places.
  partial: boolean;
  quotaExceeded: boolean;
};

type Job<Q> = { circle: Circle; level: number; types: Q };

// typeGroups: one query per request series (a group of types, or a keyword);
// empty ones are skipped.
export async function searchArea<Q extends { length: number } = readonly string[]>(options: {
  center: LatLng;
  radius: number;
  typeGroups: readonly Q[];
  call: NearbyCall<Q>;
  reserve: Reserve;
}): Promise<AreaResult> {
  const queue: Job<Q>[] = options.typeGroups
    .filter((types) => types.length > 0)
    .map((types) => ({ circle: { center: options.center, radius: options.radius }, level: 1, types }));
  const found = new Map<string, NearbyPlace>();
  let calls = 0;
  let partial = false;
  let quotaExceeded = false;

  while (queue.length > 0) {
    const room = MAX_CALLS - calls;
    if (room <= 0) {
      partial = true;
      break;
    }
    const batch = queue.splice(0, Math.min(PARALLEL, room));
    if (!(await options.reserve(batch.length))) {
      quotaExceeded = true;
      break;
    }
    calls += batch.length;
    const answers = await Promise.all(batch.map((job) => options.call(job.circle, job.types)));
    answers.forEach((places, index) => {
      const job = batch[index];
      places.forEach((place) => found.set(place.id, place));
      if (places.length >= MAX_RESULTS_PER_CALL) {
        if (job.level < MAX_LEVELS) {
          splitCircle(job.circle).forEach((circle) => queue.push({ circle, level: job.level + 1, types: job.types }));
        } else {
          partial = true;
        }
      }
    });
  }

  const places = [...found.values()]
    .map((place) => ({ ...place, distance: distanceMeters(options.center, place.location) }))
    .filter((place) => place.distance <= options.radius)
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name, "it"));
  return { places, calls, partial, quotaExceeded };
}

// "Via Esempio 1, 20121 Milano MI, Italia" -> CAP and city, for the
// duplicate check of the results (the address components are an Enterprise
// field, read only at import).
export function capAndCity(address: string | null | undefined): { cap: string | null; citta: string | null } {
  const match = (address ?? "").match(/\b(\d{5})\s+([^,]+?)(?:\s+[A-Z]{2})?\s*(?:,|$)/);
  return match ? { cap: match[1], citta: match[2].trim() } : { cap: null, citta: null };
}

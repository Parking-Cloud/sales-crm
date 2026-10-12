// OpenStreetMap Nominatim geocoding for our own addresses (car parks, and
// later verified party locations). Server side only.
//
// Usage policy (https://operations.osmfoundation.org/policies/nominatim/):
// identifying User-Agent with a contact, at most 1 request per second, no
// bulk geocoding. Here a request runs only when an administrator saves a
// changed address, and the result is saved only after they confirm it.
// Stored results need the attribution "© OpenStreetMap contributors".

const SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1000;

export type GeocodeResult =
  | { kind: "found"; formattedAddress: string; lat: number; lng: number }
  | { kind: "not-found" }
  | { kind: "error"; detail: string };

function userAgent(): string {
  const contact = process.env.NOMINATIM_CONTACT_EMAIL?.trim();
  return contact ? `ParkingCloud-SalesCRM/1.0 (${contact})` : "ParkingCloud-SalesCRM/1.0";
}

// Serializes requests from this server instance, at least 1 second apart.
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return task();
  });
  queue = run.catch(() => undefined);
  return run;
}

type NominatimPlace = { lat: string; lon: string; display_name: string };

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("q", address);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "it");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");

  return throttled(async () => {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": userAgent(), "Accept-Language": "it" },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return { kind: "error", detail: `risposta HTTP ${response.status}` };
      const places = (await response.json()) as NominatimPlace[];
      const first = places[0];
      if (!first) return { kind: "not-found" };
      const lat = Number(first.lat);
      const lng = Number(first.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { kind: "error", detail: "coordinate non valide" };
      return { kind: "found", formattedAddress: first.display_name, lat, lng };
    } catch {
      return { kind: "error", detail: "richiesta non riuscita" };
    }
  });
}

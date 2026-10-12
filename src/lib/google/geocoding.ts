// Google Geocoding API, server side only: the key is GOOGLE_MAPS_SERVER_KEY
// and is never sent to the browser. Used for car park addresses; the
// administrator confirms the result before the coordinates are saved.

export type GeocodeResult =
  | { kind: "found"; formattedAddress: string; lat: number; lng: number }
  | { kind: "not-found" }
  | { kind: "unavailable" }
  | { kind: "error"; detail: string };

export function isGeocodingEnabled(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_SERVER_KEY);
}

type GeocodeResponse = {
  status: string;
  results?: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[];
};

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) return { kind: "unavailable" };

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("region", "it");
  url.searchParams.set("language", "it");
  url.searchParams.set("key", key);

  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { kind: "error", detail: `risposta HTTP ${response.status}` };
    const body = (await response.json()) as GeocodeResponse;
    if (body.status === "ZERO_RESULTS") return { kind: "not-found" };
    const first = body.results?.[0];
    if (body.status !== "OK" || !first) return { kind: "error", detail: `stato ${body.status}` };
    return {
      kind: "found",
      formattedAddress: first.formatted_address,
      lat: first.geometry.location.lat,
      lng: first.geometry.location.lng,
    };
  } catch {
    return { kind: "error", detail: "richiesta non riuscita" };
  }
}

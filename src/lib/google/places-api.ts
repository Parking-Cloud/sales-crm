// Google Maps Platform calls, server side only (GOOGLE_MAPS_SERVER_KEY).
// Relative imports only: also used by the Netlify scheduled function.
//
// Field masks decide the SKU billed:
// - Nearby Search: id, name, address, location, types -> Nearby Search Pro
//   (never Enterprise fields in the search);
// - Text Search (keyword): the same fields -> Text Search Pro;
// - Place Details at import: phone, site, address components -> Enterprise;
// - Place Details for the 30-day refresh: location only -> Essentials;
// - Route Matrix, walking: distance and duration only -> Essentials.
// Error messages carry the HTTP status and Google's status, never the key.

import type { Circle, LatLng } from "../places/geo";
import type { NearbyPlace } from "../places/search";

const PLACES_URL = "https://places.googleapis.com/v1";
const ROUTES_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const TIMEOUT_MS = 10_000;

export const NEARBY_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType";
export const IMPORT_DETAILS_FIELD_MASK = "nationalPhoneNumber,websiteUri,addressComponents";
export const REFRESH_DETAILS_FIELD_MASK = "location";
const ROUTE_MATRIX_FIELD_MASK = "originIndex,destinationIndex,distanceMeters,duration,condition";

export class GoogleApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly googleStatus: string | null,
  ) {
    super(`Google ${httpStatus}${googleStatus ? ` ${googleStatus}` : ""}`);
  }
}

function apiKey(): string {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new GoogleApiError(0, "MISSING_KEY");
  return key;
}

async function googleFetch(url: string, init: RequestInit & { fieldMask: string }): Promise<unknown> {
  const { fieldMask, headers, ...rest } = init;
  const response = await fetch(url, {
    ...rest,
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey(), "X-Goog-FieldMask": fieldMask, ...headers },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await response.json().catch(() => null)) as { error?: { status?: string } } | null;
  if (!response.ok) throw new GoogleApiError(response.status, body?.error?.status ?? null);
  return body;
}

type RawPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
  primaryType?: string;
};

function readPlaces(body: { places?: RawPlace[] } | null): NearbyPlace[] {
  return (body?.places ?? []).flatMap((place) =>
    place.id && typeof place.location?.latitude === "number" && typeof place.location?.longitude === "number"
      ? [
          {
            id: place.id,
            name: place.displayName?.text?.trim() || "Senza nome",
            address: place.formattedAddress ?? null,
            location: { lat: place.location.latitude, lng: place.location.longitude },
            types: Array.isArray(place.types) ? place.types.filter((type) => typeof type === "string") : [],
            primaryType: typeof place.primaryType === "string" ? place.primaryType : null,
          },
        ]
      : [],
  );
}

// Rectangle around a circle: Text Search restricts to rectangles only; the
// places outside the circle are dropped afterwards (searchArea).
export function boundingBox(circle: Circle): { low: LatLng; high: LatLng } {
  const latDelta = (circle.radius / 6_371_008.8) * (180 / Math.PI);
  const lngDelta = latDelta / Math.cos((circle.center.lat * Math.PI) / 180);
  return {
    low: { lat: circle.center.lat - latDelta, lng: circle.center.lng - lngDelta },
    high: { lat: circle.center.lat + latDelta, lng: circle.center.lng + lngDelta },
  };
}

// Text Search (New) for a keyword, within the rectangle around the circle;
// at most 20 results (one page), like Nearby Search.
export async function textSearch(circle: Circle, keyword: string): Promise<NearbyPlace[]> {
  const box = boundingBox(circle);
  const body = (await googleFetch(`${PLACES_URL}/places:searchText`, {
    method: "POST",
    fieldMask: NEARBY_FIELD_MASK,
    body: JSON.stringify({
      textQuery: keyword,
      pageSize: 20,
      languageCode: "it",
      regionCode: "it",
      locationRestriction: {
        rectangle: {
          low: { latitude: box.low.lat, longitude: box.low.lng },
          high: { latitude: box.high.lat, longitude: box.high.lng },
        },
      },
    }),
  })) as { places?: RawPlace[] } | null;
  return readPlaces(body);
}

export async function nearbySearch(circle: Circle, types: readonly string[]): Promise<NearbyPlace[]> {
  const body = (await googleFetch(`${PLACES_URL}/places:searchNearby`, {
    method: "POST",
    fieldMask: NEARBY_FIELD_MASK,
    body: JSON.stringify({
      includedTypes: types,
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      languageCode: "it",
      regionCode: "it",
      locationRestriction: {
        circle: { center: { latitude: circle.center.lat, longitude: circle.center.lng }, radius: Math.min(circle.radius, 50_000) },
      },
    }),
  })) as { places?: RawPlace[] } | null;
  return readPlaces(body);
}

export type ImportDetails = {
  telefono: string | null;
  sito: string | null;
  indirizzo: string | null;
  cap: string | null;
  citta: string | null;
};

type AddressComponent = { longText?: string; shortText?: string; types?: string[] };

export function readAddressComponents(components: AddressComponent[] | undefined): Pick<ImportDetails, "indirizzo" | "cap" | "citta"> {
  const pick = (type: string) => components?.find((component) => component.types?.includes(type))?.longText?.trim() || null;
  const route = pick("route");
  const number = pick("street_number");
  return {
    indirizzo: route ? [route, number].filter(Boolean).join(" ") : null,
    cap: pick("postal_code"),
    citta: pick("locality") ?? pick("administrative_area_level_3"),
  };
}

// Place Details for the import: phone, site, address (Enterprise SKU).
// Null when the place no longer exists.
export async function importDetails(placeId: string): Promise<ImportDetails | null> {
  try {
    const body = (await googleFetch(`${PLACES_URL}/places/${encodeURIComponent(placeId)}?languageCode=it&regionCode=it`, {
      method: "GET",
      fieldMask: IMPORT_DETAILS_FIELD_MASK,
    })) as { nationalPhoneNumber?: string; websiteUri?: string; addressComponents?: AddressComponent[] } | null;
    return {
      telefono: body?.nationalPhoneNumber?.trim() || null,
      sito: body?.websiteUri?.trim() || null,
      ...readAddressComponents(body?.addressComponents),
    };
  } catch (error) {
    if (error instanceof GoogleApiError && error.httpStatus === 404) return null;
    throw error;
  }
}

// Place Details for the 30-day refresh: location only (Essentials SKU).
// Null when the place no longer exists.
export async function placeLocation(placeId: string): Promise<LatLng | null> {
  try {
    const body = (await googleFetch(`${PLACES_URL}/places/${encodeURIComponent(placeId)}`, {
      method: "GET",
      fieldMask: REFRESH_DETAILS_FIELD_MASK,
    })) as { location?: { latitude?: number; longitude?: number } } | null;
    const { latitude, longitude } = body?.location ?? {};
    return typeof latitude === "number" && typeof longitude === "number" ? { lat: latitude, lng: longitude } : null;
  } catch (error) {
    if (error instanceof GoogleApiError && error.httpStatus === 404) return null;
    throw error;
  }
}

export type WalkingRoute = { index: number; meters: number | null; seconds: number | null };

// Walking distance from one origin (the car park) to up to 25 places.
export async function walkingMatrix(origin: LatLng, destinations: readonly LatLng[]): Promise<WalkingRoute[]> {
  const waypoint = (point: LatLng) => ({ waypoint: { location: { latLng: { latitude: point.lat, longitude: point.lng } } } });
  const body = (await googleFetch(ROUTES_URL, {
    method: "POST",
    fieldMask: ROUTE_MATRIX_FIELD_MASK,
    body: JSON.stringify({ origins: [waypoint(origin)], destinations: destinations.map(waypoint), travelMode: "WALK", languageCode: "it" }),
  })) as { destinationIndex?: number; distanceMeters?: number; duration?: string; condition?: string }[] | null;
  return (Array.isArray(body) ? body : []).map((element) => ({
    index: element.destinationIndex ?? 0,
    meters: element.condition === "ROUTE_EXISTS" && typeof element.distanceMeters === "number" ? element.distanceMeters : null,
    seconds:
      element.condition === "ROUTE_EXISTS" && typeof element.duration === "string" ? Number.parseInt(element.duration, 10) || null : null,
  }));
}

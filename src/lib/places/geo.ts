// Distances and circles on the Earth for the map search. Pure: unit tested.

export type LatLng = { lat: number; lng: number };
export type Circle = { center: LatLng; radius: number };

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

// Straight-line (great circle) distance in metres, rounded.
export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h))));
}

// Point moved by north/east metres (fine for a few kilometres).
export function offset(point: LatLng, northM: number, eastM: number): LatLng {
  return {
    lat: point.lat + (northM / EARTH_RADIUS_M) * (180 / Math.PI),
    lng: point.lng + (eastM / (EARTH_RADIUS_M * Math.cos(rad(point.lat)))) * (180 / Math.PI),
  };
}

// Four circles covering a circle: one per quadrant, each circumscribing the
// quadrant's square (centre at ±r/2, ±r/2; radius r/√2).
export function splitCircle({ center, radius }: Circle): Circle[] {
  const half = radius / 2;
  const childRadius = Math.ceil(radius / Math.SQRT2);
  return [
    [half, -half],
    [half, half],
    [-half, -half],
    [-half, half],
  ].map(([north, east]) => ({ center: offset(center, north, east), radius: childRadius }));
}

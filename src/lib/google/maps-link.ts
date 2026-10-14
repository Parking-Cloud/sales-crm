// "Apri in Google Maps" on the place, never on bare coordinates, with the
// official Google Maps URLs format (no API call, no key):
// https://www.google.com/maps/search/?api=1&query=<name + address>&query_place_id=<place id>
// Without a place id (e.g. parties from the Excel import) the name and the
// address are enough. Pure: unit tested.

export type MapsPlace = {
  name?: string | null;
  address?: string | null;
  placeId?: string | null;
};

export function googleMapsPlaceUrl(place: MapsPlace): string | null {
  const query = [place.name, place.address]
    .map((part) => (part ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(", ");
  const placeId = (place.placeId ?? "").trim();
  if (!query) return null;
  const params = new URLSearchParams({ api: "1", query });
  if (placeId) params.set("query_place_id", placeId);
  return `https://www.google.com/maps/search/?${params.toString().replace(/\+/g, "%20")}`;
}

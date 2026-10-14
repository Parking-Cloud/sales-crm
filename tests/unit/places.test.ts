// Unit tests of the map search: categories, geometry, area search with
// FAKE Google answers, limits.  Run: npm run test:unit
import assert from "node:assert/strict";
import { test } from "node:test";
import { readAddressComponents } from "../../src/lib/google/places-api";
import { refreshGoogleData, type RpcClient } from "../../src/lib/google/refresh";
import { CATEGORY_TYPES, SEARCH_CATEGORIES, categoryForPlace, typesFor } from "../../src/lib/places/categories";
import { distanceMeters, offset, splitCircle, type Circle } from "../../src/lib/places/geo";
import { MAX_CALLS, capAndCity, searchArea, type NearbyPlace } from "../../src/lib/places/search";

const CENTER = { lat: 45.4642, lng: 9.19 };

test("categories: every search category has types; Google type back to our category", () => {
  assert.equal(SEARCH_CATEGORIES.length, 9);
  for (const category of SEARCH_CATEGORIES) assert.ok(CATEGORY_TYPES[category].length > 0, category);
  assert.deepEqual(typesFor(["Ristoranti", "Hotel"]), ["restaurant", "cafe", "bar", "hotel", "bed_and_breakfast"]);
  assert.equal(categoryForPlace("lawyer", ["lawyer", "point_of_interest"]), "Studi professionali");
  assert.equal(categoryForPlace("hotel", ["hotel", "lodging"]), "Hotel");
  assert.equal(categoryForPlace("guest_house", ["lodging"]), "Strutture ricettive");
  assert.equal(categoryForPlace("museum", ["tourist_attraction"]), "Altro");
  // corporate_office is both "Uffici" and "Aziende": the searched one wins.
  assert.equal(categoryForPlace("corporate_office", [], ["Aziende"]), "Aziende");
  assert.equal(categoryForPlace("corporate_office", []), "Uffici");
  // Primary type before the other types.
  assert.equal(categoryForPlace("cafe", ["store", "cafe"]), "Ristoranti");
});

test("geometry: distances and the 4 circles covering a circle", () => {
  assert.equal(distanceMeters(CENTER, CENTER), 0);
  const north = offset(CENTER, 1000, 0);
  assert.ok(Math.abs(distanceMeters(CENTER, north) - 1000) <= 1);
  assert.ok(Math.abs(distanceMeters({ lat: 45.4642, lng: 9.19 }, { lat: 45.4742, lng: 9.19 }) - 1112) <= 2);
  const circle: Circle = { center: CENTER, radius: 1000 };
  const parts = splitCircle(circle);
  assert.equal(parts.length, 4);
  // Points on a grid inside the circle are all covered by a child circle.
  for (let n = -1000; n <= 1000; n += 100) {
    for (let e = -1000; e <= 1000; e += 100) {
      const point = offset(CENTER, n, e);
      if (distanceMeters(CENTER, point) > 1000) continue;
      assert.ok(parts.some((part) => distanceMeters(part.center, point) <= part.radius + 1), `punto ${n},${e}`);
    }
  }
});

// FAKE Google: places on a grid around the centre, 20 at most per call,
// nearest first, like rankPreference DISTANCE.
function fakeGoogle(count: number, spacing = 40) {
  const all: NearbyPlace[] = [];
  const side = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const north = (Math.floor(i / side) - side / 2) * spacing;
    const east = ((i % side) - side / 2) * spacing;
    all.push({ id: `finto-${i}`, name: `Luogo Finto ${i}`, address: null, location: offset(CENTER, north, east), types: ["restaurant"], primaryType: "restaurant" });
  }
  const calls: Circle[] = [];
  const call = async (circle: Circle) => {
    calls.push(circle);
    return all
      .map((place) => ({ place, d: distanceMeters(circle.center, place.location) }))
      .filter(({ d }) => d <= circle.radius)
      .sort((a, b) => a.d - b.d)
      .slice(0, 20)
      .map(({ place }) => place);
  };
  return { all, calls, call };
}

test("area search: one call when under 20 results", async () => {
  const google = fakeGoogle(12);
  const result = await searchArea({ center: CENTER, radius: 500, typeGroups: [["restaurant"]], call: google.call, reserve: async () => true });
  assert.equal(result.calls, 1);
  assert.equal(result.places.length, 12);
  assert.equal(result.partial, false);
});

test("area search: 20 results -> 4 smaller circles, results deduplicated, outside the radius dropped, by distance", async () => {
  const google = fakeGoogle(60, 30);
  const result = await searchArea({ center: CENTER, radius: 200, typeGroups: [["restaurant"]], call: google.call, reserve: async () => true });
  assert.ok(result.calls >= 5, `${result.calls} chiamate`);
  const ids = result.places.map((place) => place.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(result.places.every((place) => place.distance <= 200));
  const expected = google.all.filter((place) => distanceMeters(CENTER, place.location) <= 200).length;
  assert.equal(result.places.length, expected);
  assert.deepEqual(result.places.map((place) => place.distance), [...result.places.map((place) => place.distance)].sort((a, b) => a - b));
});

test("area search: at most 3 levels, then partial", async () => {
  const google = fakeGoogle(3000, 5);
  const result = await searchArea({ center: CENTER, radius: 400, typeGroups: [["restaurant"]], call: google.call, reserve: async () => true });
  assert.equal(result.calls, 1 + 4 + 16);
  assert.equal(result.partial, true);
});

test("area search: at most 60 calls per search, then partial", async () => {
  const google = fakeGoogle(3000, 5);
  const groups = [["restaurant"], ["cafe"], ["bar"], ["hotel"]];
  const result = await searchArea({ center: CENTER, radius: 400, typeGroups: groups, call: google.call, reserve: async () => true });
  assert.equal(result.calls, MAX_CALLS);
  assert.equal(result.partial, true);
});

test("area search: daily limit reached -> stops, no call made over it", async () => {
  const google = fakeGoogle(3000, 5);
  let left = 6;
  const reserve = async (n: number) => {
    if (n > left) return false;
    left -= n;
    return true;
  };
  const result = await searchArea({ center: CENTER, radius: 400, typeGroups: [["restaurant"]], call: google.call, reserve });
  // 1 call, then 4 (the split circle); the next batch of 8 would go over.
  assert.equal(result.quotaExceeded, true);
  assert.equal(result.calls, 5);
  assert.equal(google.calls.length, 5);
  assert.ok(left >= 0);
});

test("addresses: CAP and city from the formatted address and from address components", () => {
  assert.deepEqual(capAndCity("Via Esempio 1, 20121 Milano MI, Italia"), { cap: "20121", citta: "Milano" });
  assert.deepEqual(capAndCity("Piazza Finta, 00186 Roma RM, Italia"), { cap: "00186", citta: "Roma" });
  assert.deepEqual(capAndCity("Italia"), { cap: null, citta: null });
  assert.deepEqual(
    readAddressComponents([
      { longText: "Via Esempio", types: ["route"] },
      { longText: "12", types: ["street_number"] },
      { longText: "20121", types: ["postal_code"] },
      { longText: "Milano", types: ["locality", "political"] },
    ]),
    { indirizzo: "Via Esempio 12", cap: "20121", citta: "Milano" },
  );
});

// FAKE database for the 30-day refresh: due locations, quota, saved rows.
function fakeDb(due: number, quota: number) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let left = quota;
  const client: RpcClient = {
    rpc: async (name, args) => {
      calls.push({ name, args });
      if (name === "google_locations_due") {
        return { data: Array.from({ length: due }, (_, i) => ({ location_id: `sede-${i}`, place_id: `finto-${i}` })), error: null };
      }
      if (name === "use_api_quota") {
        const n = Number(args.p_n);
        if (n > left) return { data: { ok: false }, error: null };
        left -= n;
        return { data: { ok: true }, error: null };
      }
      if (name === "apply_google_coordinates") {
        const rows = args.p_rows as { lat: number | null }[];
        return { data: { aggiornate: rows.filter((row) => row.lat !== null).length, cancellate: rows.filter((row) => row.lat === null).length }, error: null };
      }
      return { data: null, error: { message: "sconosciuta" } };
    },
  };
  return { client, calls };
}

test("30-day refresh: re-reads due locations, clears vanished places, counts each request", async () => {
  const db = fakeDb(10, 100);
  const result = await refreshGoogleData(db.client, async (placeId) => (placeId === "finto-3" ? null : { lat: 45.1, lng: 9.1 }));
  assert.deepEqual(result, { lette: 10, aggiornate: 9, cancellate: 1, errori: 0, limite: false });
  const quotas = db.calls.filter((call) => call.name === "use_api_quota");
  assert.equal(quotas.reduce((total, call) => total + Number(call.args.p_n), 0), 10);
  assert.ok(quotas.every((call) => call.args.p_sku === "place_details_essentials"));
  assert.equal(db.calls[0].args.p_days, 25);
  assert.equal(db.calls[0].args.p_limit, 200);
});

test("30-day refresh: Google errors left for the next night, quota reached stops", async () => {
  const db = fakeDb(20, 8);
  const result = await refreshGoogleData(db.client, async (placeId) => {
    if (placeId === "finto-2") throw new Error("Google 500");
    return { lat: 45.1, lng: 9.1 };
  });
  assert.equal(result.lette, 8);
  assert.equal(result.errori, 1);
  assert.equal(result.aggiornate, 7);
  assert.equal(result.limite, true);
});

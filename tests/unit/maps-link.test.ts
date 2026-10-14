// Unit tests of the Google Maps URL (A3).  Run: npm run test:unit
import assert from "node:assert/strict";
import { test } from "node:test";
import { googleMapsPlaceUrl } from "../../src/lib/google/maps-link";

test("Google Maps URL: name and address, with place id", () => {
  const url = googleMapsPlaceUrl({ name: "Trattoria Esempio", address: "Via Esempio 1, 20121 Milano", placeId: "ChIJfintoEsempio123" });
  assert.equal(
    url,
    "https://www.google.com/maps/search/?api=1&query=Trattoria%20Esempio%2C%20Via%20Esempio%201%2C%2020121%20Milano&query_place_id=ChIJfintoEsempio123",
  );
});

test("Google Maps URL: without place id only name and address, never coordinates", () => {
  const url = googleMapsPlaceUrl({ name: "Azienda Esempio Srl", address: "Via Prova 2, Milano", placeId: null })!;
  assert.ok(!url.includes("query_place_id"));
  assert.ok(!/\d+\.\d{4,}/.test(url), "nessuna coordinata nell'URL");
  assert.equal(new URL(url).searchParams.get("query"), "Azienda Esempio Srl, Via Prova 2, Milano");
});

test("Google Maps URL: special characters are encoded", () => {
  const url = googleMapsPlaceUrl({ name: "Caffè & Bistrot \"L'Angolo\" #1", address: "Piazza Città 3/B, 20100 Milano" })!;
  assert.ok(!url.includes(" ") && !url.includes("&B") && !url.includes("#"));
  assert.equal(new URL(url).searchParams.get("query"), "Caffè & Bistrot \"L'Angolo\" #1, Piazza Città 3/B, 20100 Milano");
  assert.equal(new URL(url).searchParams.get("api"), "1");
});

test("Google Maps URL: nothing to search -> no link", () => {
  assert.equal(googleMapsPlaceUrl({ name: " ", address: null, placeId: "ChIJsoloId" }), null);
});

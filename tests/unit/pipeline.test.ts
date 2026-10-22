// Unit tests of the pipeline: Rome day boundaries, stage labels, entry of a
// new prospect with a car park.  Run: npm run test:unit
import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, dayBounds, romeDay, romeInstant } from "../../src/lib/pipeline/dates";
import { MANUAL_STAGES, isManualStage, opportunityBadge } from "../../src/lib/pipeline/labels";
import { defaultStageFor, readPipelineEntry } from "../../src/lib/pipeline/entry";

const PARK = "00000000-0000-4000-8000-0000000000d1";

test("Rome days: summer and winter time, day boundaries", () => {
  assert.equal(romeInstant("2026-07-15", "09:00").toISOString(), "2026-07-15T07:00:00.000Z");
  assert.equal(romeInstant("2026-12-15", "09:00").toISOString(), "2026-12-15T08:00:00.000Z");
  // 23:30 UTC on 14 October is already 15 October in Rome.
  assert.equal(romeDay(new Date("2026-10-14T23:30:00Z")), "2026-10-15");
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  const bounds = dayBounds(new Date("2026-10-15T10:00:00Z"));
  assert.equal(bounds.today.toISOString(), "2026-10-14T22:00:00.000Z");
  assert.equal(bounds.tomorrow.toISOString(), "2026-10-15T22:00:00.000Z");
  // The week ends after the change to winter time (25 October).
  assert.equal(bounds.week.toISOString(), "2026-10-22T22:00:00.000Z");
});

test("stages: only Individuata…Vinta by hand; badges carry text", () => {
  assert.equal(MANUAL_STAGES.length, 6);
  assert.equal(isManualStage("vinta"), true);
  assert.equal(isManualStage("passata_bo"), false);
  assert.equal(isManualStage("attivata"), false);
  assert.deepEqual(opportunityBadge("contattata", "persa"), { label: "Persa", tone: "neutral" });
  assert.deepEqual(opportunityBadge("interessata", "aperta"), { label: "Interessata", tone: "info" });
});

test("pipeline entry (1a-7): no car park, origin proposes the stage, invalid values refused", () => {
  assert.deepEqual(readPipelineEntry({}), { entry: null, errors: {} });
  assert.deepEqual(readPipelineEntry({ parcheggio_interesse: PARK }).entry, { parkingId: PARK, origine: null, fase: "individuata" });
  assert.deepEqual(readPipelineEntry({ parcheggio_interesse: PARK, origine: "contatto_in_entrata" }).entry, {
    parkingId: PARK,
    origine: "contatto_in_entrata",
    fase: "interessata",
  });
  // The proposal can be changed.
  assert.equal(readPipelineEntry({ parcheggio_interesse: PARK, origine: "contatto_in_entrata", fase_iniziale: "contattata" }).entry?.fase, "contattata");
  assert.equal(defaultStageFor("segnalazione"), "individuata");
  const bad = readPipelineEntry({ parcheggio_interesse: "x", origine: "web", fase_iniziale: "vinta" });
  assert.equal(bad.entry, null);
  assert.deepEqual(Object.keys(bad.errors).sort(), ["fase_iniziale", "origine", "parcheggio_interesse"]);
  // Handoff stages and later ones are never a starting stage.
  assert.equal(readPipelineEntry({ parcheggio_interesse: PARK, fase_iniziale: "passata_bo" }).entry, null);
});

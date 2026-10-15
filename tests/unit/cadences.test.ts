// Unit tests of cadences (block 1a-8): working days, due times across the
// DST change, statistics.  Run: npm run test:unit
import assert from "node:assert/strict";
import { test } from "node:test";
import { addBusinessDays, cadenceStats, stepDue, waitLabel } from "../../src/lib/cadences/schedule";

test("working days: weekends skipped, weekend start moves to Monday", () => {
  assert.equal(addBusinessDays("2026-10-16", 1), "2026-10-19"); // Friday + 1 = Monday
  assert.equal(addBusinessDays("2026-10-17", 0), "2026-10-19"); // Saturday + 0 = Monday
  assert.equal(addBusinessDays("2026-10-18", 1), "2026-10-20"); // Sunday + 1 = Tuesday
  assert.equal(addBusinessDays("2026-10-14", 2), "2026-10-16"); // Wednesday + 2 = Friday
  assert.equal(addBusinessDays("2026-10-15", 3), "2026-10-20"); // Thursday + 3 = Tuesday
  assert.equal(addBusinessDays("2026-10-19", 0), "2026-10-19");
  assert.equal(addBusinessDays("2026-10-16", 10), "2026-10-30");
  assert.equal(addBusinessDays("2026-12-31", 1), "2027-01-01"); // no holidays
});

test("due time: Rome time, also across the DST change (25 October)", () => {
  assert.equal(stepDue("2026-10-23", 0, "10:30").toISOString(), "2026-10-23T08:30:00.000Z");
  assert.equal(stepDue("2026-10-23", 1, "10:30:00").toISOString(), "2026-10-26T09:30:00.000Z");
  assert.equal(stepDue("2026-10-23", 1, null).toISOString(), "2026-10-26T08:00:00.000Z");
  assert.equal(stepDue("2027-03-26", 1, "09:00").toISOString(), "2027-03-29T07:00:00.000Z");
});

test("statistics: active, paused, stopped with outcome, completed", () => {
  assert.deepEqual(
    cadenceStats([
      { stato: "attiva", esito: null },
      { stato: "attiva", esito: null },
      { stato: "in_pausa", esito: null },
      { stato: "fermata", esito: "risposto" },
      { stato: "fermata", esito: "convertito" },
      { stato: "fermata", esito: "non_contattare" },
      { stato: "completata", esito: null },
    ]),
    { attivi: 2, inPausa: 1, fermati: 3, risposto: 1, convertiti: 1, completati: 1 },
  );
  assert.equal(waitLabel(0), "subito");
  assert.equal(waitLabel(2), "+2 giorni lav.");
});

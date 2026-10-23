// Unit tests of the Analytics page of block 1a-10: periods in Rome days,
// distinct counts, acceptance rate, weeks from Monday with zeros, rows by
// car park.
// Run: npm run test:unit
import assert from "node:assert/strict";
import { test } from "node:test";
import { acceptanceRate, countEvents, parkingCities, parkingRows, weeklyCounts, type AnalyticsEvent } from "../../src/lib/analytics/aggregate";
import { presetPeriod, readPeriod } from "../../src/lib/analytics/period";

test("periods: this month, last month, last 90 days, custom", () => {
  assert.deepEqual(presetPeriod("questo_mese", "2026-10-22"), { da: "2026-10-01", a: "2026-10-22" });
  assert.deepEqual(presetPeriod("mese_scorso", "2026-10-22"), { da: "2026-09-01", a: "2026-09-30" });
  assert.deepEqual(presetPeriod("mese_scorso", "2026-03-05"), { da: "2026-02-01", a: "2026-02-28" });
  assert.deepEqual(presetPeriod("mese_scorso", "2027-01-10"), { da: "2026-12-01", a: "2026-12-31" });
  assert.deepEqual(presetPeriod("ultimi_90", "2026-10-22"), { da: "2026-07-25", a: "2026-10-22" });
  assert.deepEqual(readPeriod({}, "2026-10-22"), { preset: "questo_mese", da: "2026-10-01", a: "2026-10-22", error: null });
  assert.deepEqual(readPeriod({ periodo: "x" }, "2026-10-22").preset, "questo_mese");
  assert.deepEqual(readPeriod({ periodo: "personalizzato", da: "2026-01-15", a: "2026-02-10" }, "2026-10-22"), {
    preset: "personalizzato",
    da: "2026-01-15",
    a: "2026-02-10",
    error: null,
  });
});

test("periods: a wrong custom period falls back to this month and says why", () => {
  const today = "2026-10-22";
  for (const params of [
    { periodo: "personalizzato" },
    { periodo: "personalizzato", da: "2026-02-30", a: "2026-03-10" },
    { periodo: "personalizzato", da: "2026-03-10", a: "2026-03-01" },
    { periodo: "personalizzato", da: "2020-01-01", a: "2026-03-01" },
  ]) {
    const period = readPeriod(params, today);
    assert.equal(period.da, "2026-10-01");
    assert.equal(period.a, today);
    assert.ok(period.error);
  }
});

const ev = (tipo: AnalyticsEvent["tipo"], giorno: string, partyId: string, opportunityId: string | null, parkingId: string | null): AnalyticsEvent => ({
  tipo,
  giorno,
  partyId,
  opportunityId,
  parkingId,
});

// A prospect on two car parks: one row per car park for its prospect events.
const EVENTS: AnalyticsEvent[] = [
  ev("contattato", "2026-10-03", "x1", "o1a", "p1"),
  ev("contattato", "2026-10-03", "x1", "o1b", "p2"),
  ev("interessato", "2026-10-05", "x1", "o1a", "p1"),
  ev("interessato", "2026-10-05", "x1", "o1b", "p2"),
  ev("contattato", "2026-10-04", "x4", null, null),
  ev("inviata", "2026-10-06", "x1", "o1a", "p1"),
  ev("inviata", "2026-10-07", "x1", "o1b", "p2"),
  ev("inviata", "2026-10-13", "x2", "o2a", "p1"),
  ev("accettata", "2026-10-14", "x1", "o1a", "p1"),
];

test("counts: prospects once, offers once per pipeline row", () => {
  const counts = countEvents(EVENTS);
  assert.deepEqual(counts, { contattato: 2, interessato: 1, inviata: 3, accettata: 1, rifiutata: 0 });
  assert.equal(acceptanceRate(counts), 1 / 3);
  assert.equal(acceptanceRate(countEvents([])), null);
  assert.deepEqual(countEvents([]), { contattato: 0, interessato: 0, inviata: 0, accettata: 0, rifiutata: 0 });
});

test("weeks: Monday to Sunday, cut to the period, zeros when empty", () => {
  // 1 October 2026 is a Thursday.
  const weeks = weeklyCounts(EVENTS, "2026-10-01", "2026-10-22");
  assert.deepEqual(
    weeks.map((week) => [week.da, week.a]),
    [
      ["2026-10-01", "2026-10-04"],
      ["2026-10-05", "2026-10-11"],
      ["2026-10-12", "2026-10-18"],
      ["2026-10-19", "2026-10-22"],
    ],
  );
  assert.deepEqual(weeks.map((week) => week.counts.inviata), [0, 2, 1, 0]);
  assert.deepEqual(weeks.map((week) => week.counts.interessato), [0, 1, 0, 0]);
  assert.deepEqual(weeks[3].counts, { contattato: 0, interessato: 0, inviata: 0, accettata: 0, rifiutata: 0 });
  assert.equal(weeklyCounts([], "2026-09-01", "2026-09-30").length, 5);
  assert.deepEqual(weeklyCounts([], "2026-10-05", "2026-10-05").map((week) => [week.da, week.a]), [["2026-10-05", "2026-10-05"]]);
});

test("car parks: same numbers per car park, prospects without car parks last", () => {
  const rows = parkingRows(EVENTS, [
    { id: "p1", nome: "Parcheggio Esempio Zeta", citta: "Città Finta" },
    { id: "p2", nome: "Parcheggio Esempio Alfa", citta: null },
  ]);
  assert.deepEqual(
    rows.map((row) => [row.nome, row.counts.contattato, row.counts.interessato, row.counts.inviata, row.counts.accettata, row.tasso]),
    [
      ["Parcheggio Esempio Alfa", 1, 1, 1, 0, 0],
      ["Parcheggio Esempio Zeta", 1, 1, 2, 1, 0.5],
      ["Senza parcheggio", 1, 0, 0, 0, null],
    ],
  );
  assert.equal(rows[1].citta, "Città Finta");
  assert.deepEqual(parkingRows([], []), []);
});

test("cities of the car parks: once each, case ignored, by name", () => {
  assert.deepEqual(
    parkingCities([
      { id: "1", nome: "A", citta: "Città Finta Beta" },
      { id: "2", nome: "B", citta: "città finta beta" },
      { id: "3", nome: "C", citta: null },
      { id: "4", nome: "D", citta: "Città Finta Alfa" },
    ]),
    ["Città Finta Alfa", "Città Finta Beta"],
  );
});

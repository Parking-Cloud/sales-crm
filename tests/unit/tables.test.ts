// Unit tests of the tables of block 1a-9: pages of 50, filters and sorting
// in the URL, reminder days and colours, status labels and tones.
// Run: npm run test:unit
import assert from "node:assert/strict";
import { test } from "node:test";
import { pageCount, pageOffset, pageRange, readPage, TABLE_PAGE_SIZE } from "../../src/lib/tables/paging";
import { hasFilters, nextSort, readTableQuery, tableSearch, withFilter } from "../../src/lib/tables/query";
import { daysBetween, reminderDue } from "../../src/lib/tables/reminders";
import {
  OFFER_STATUSES,
  OFFER_STATUS_LABELS,
  OFFER_STATUS_TONES,
  PROSPECT_STATUSES,
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUS_TONES,
  isLead,
  reasonLabel,
} from "../../src/lib/prospect/labels";
import { PROSPECT_FILTERS, PROSPECT_SORTS } from "../../src/lib/prospect/filters";

test("pages: at most 50 rows, page from the URL, range shown", () => {
  assert.equal(TABLE_PAGE_SIZE, 50);
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(50), 1);
  assert.equal(pageCount(51), 2);
  assert.equal(pageCount(382), 8);
  assert.equal(pageOffset(1), 0);
  assert.equal(pageOffset(3), 100);
  assert.equal(readPage("2"), 2);
  assert.equal(readPage("0"), 1);
  assert.equal(readPage("-1"), 1);
  assert.equal(readPage("abc"), 1);
  assert.equal(readPage(undefined), 1);
  assert.equal(readPage("9", 55), 2);
  assert.equal(pageRange(1, 55), "1–50 di 55");
  assert.equal(pageRange(2, 55), "51–55 di 55");
  assert.equal(pageRange(1, 0), "0 di 0");
  assert.equal(pageRange(1, 1200), "1–50 di 1.200");
});

test("URL query: known filters only, sort keys checked, back to page 1 on change", () => {
  const query = readTableQuery(
    { nome: "  Esempio ", stato: "interessato", ignoto: "x", ordina: "telefono", verso: "desc", pagina: "3", note: "" },
    PROSPECT_FILTERS,
    PROSPECT_SORTS,
  );
  assert.deepEqual(query, { filters: { nome: "Esempio", stato: "interessato" }, sort: "telefono", desc: true, page: 3 });
  assert.equal(readTableQuery({ ordina: "password" }, PROSPECT_FILTERS, PROSPECT_SORTS).sort, null);
  assert.equal(tableSearch(query), "?stato=interessato&nome=Esempio&ordina=telefono&verso=desc&pagina=3");
  assert.equal(tableSearch(withFilter(query, "nome", "")), "?stato=interessato&ordina=telefono&verso=desc");
  assert.equal(hasFilters(withFilter(withFilter(query, "nome", ""), "stato", " ")), false);
  const base = readTableQuery({}, PROSPECT_FILTERS, PROSPECT_SORTS);
  assert.equal(tableSearch(base), "");
  const asc = nextSort(base, "nome");
  assert.deepEqual([asc.sort, asc.desc], ["nome", false]);
  const desc = nextSort(asc, "nome");
  assert.deepEqual([desc.sort, desc.desc], ["nome", true]);
  const none = nextSort(desc, "nome");
  assert.deepEqual([none.sort, none.desc], [null, false]);
  assert.deepEqual(nextSort(desc, "stato").sort, "stato");
});

test("reminder: days between calendar dates, also across the clock change", () => {
  assert.equal(daysBetween("2026-10-22", "2026-10-23"), 1);
  assert.equal(daysBetween("2026-10-22", "2026-10-20"), -2);
  assert.equal(daysBetween("2026-10-24", "2026-10-26"), 2);
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
});

test("reminder: labels and colours (green beyond 3 days, warning within 3 and today, red overdue)", () => {
  assert.equal(reminderDue(null), null);
  assert.deepEqual(reminderDue(-1), { label: "scaduto da 1 giorno", tone: "critical" });
  assert.deepEqual(reminderDue(-5), { label: "scaduto da 5 giorni", tone: "critical" });
  assert.deepEqual(reminderDue(0), { label: "oggi", tone: "attention" });
  assert.deepEqual(reminderDue(1), { label: "tra 1 giorno", tone: "attention" });
  assert.deepEqual(reminderDue(3), { label: "tra 3 giorni", tone: "attention" });
  assert.deepEqual(reminderDue(4), { label: "tra 4 giorni", tone: "success" });
});

test("statuses: every value has a text label and a tone (grey, light blue, green, red)", () => {
  assert.deepEqual(PROSPECT_STATUSES.map((s) => PROSPECT_STATUS_LABELS[s]), ["Da contattare", "Interessato", "Molto interessato", "Non interessato"]);
  assert.deepEqual(PROSPECT_STATUSES.map((s) => PROSPECT_STATUS_TONES[s]), ["neutral", "info", "success", "critical"]);
  assert.deepEqual(OFFER_STATUSES.map((s) => OFFER_STATUS_LABELS[s]), ["Offerta da inviare", "Offerta inviata", "Accettata", "Rifiutata"]);
  assert.deepEqual(OFFER_STATUSES.map((s) => OFFER_STATUS_TONES[s]), ["neutral", "info", "success", "critical"]);
  assert.deepEqual(PROSPECT_STATUSES.filter(isLead), ["interessato", "molto_interessato"]);
  assert.equal(reasonLabel("prezzo"), "Prezzo");
  assert.equal(reasonLabel("non_indicato"), null);
  assert.equal(reasonLabel(null), null);
});

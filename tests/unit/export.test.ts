// Unit tests of the CSV export (block 1a-8).  Run: npm run test:unit
import assert from "node:assert/strict";
import { test } from "node:test";
import { EXPORT_COLUMNS, exportFileName, csvField, toCsv } from "../../src/lib/export/csv";

test("CSV fields: commas, quotes, accents, line breaks, edge spaces", () => {
  assert.equal(csvField("Mario"), "Mario");
  assert.equal(csvField(null), "");
  assert.equal(csvField("Rossi, Bianchi & C."), '"Rossi, Bianchi & C."');
  assert.equal(csvField('Ufficio "acquisti"'), '"Ufficio ""acquisti"""');
  assert.equal(csvField("Città: Forlì"), "Città: Forlì");
  assert.equal(csvField("riga 1\nriga 2"), '"riga 1\nriga 2"');
  assert.equal(csvField("a\r\nb"), '"a\r\nb"');
  assert.equal(csvField(" spazio"), '" spazio"');
  assert.equal(csvField("+39 02 0000 0000"), "+39 02 0000 0000");
});

test("CSV file: English headers in a fixed order, CRLF lines, one row per contact", () => {
  const empty = Object.fromEntries(EXPORT_COLUMNS.map((column) => [column, null])) as Record<(typeof EXPORT_COLUMNS)[number], string | null>;
  const csv = toCsv(EXPORT_COLUMNS, [
    { ...empty, first_name: "Mario", last_name: "Esempio", job_title: 'Resp. "acquisti", sede', email: "mario@example.com", company: "Azienda Esempio Srl", city: "Forlì", stage: "Da contattare", email_permission: "sì - richiesta in chiamata" },
    { ...empty, company: "Studio Prova", email_permission: "no" },
  ]);
  assert.equal(
    csv,
    "first_name,last_name,job_title,email,phone,company,website,city,parking,stage,email_permission\r\n" +
      'Mario,Esempio,"Resp. ""acquisti"", sede",mario@example.com,,Azienda Esempio Srl,,Forlì,,Da contattare,sì - richiesta in chiamata\r\n' +
      ",,,,,Studio Prova,,,,,no\r\n",
  );
  assert.equal(exportFileName("2026-10-15"), "soggetti-2026-10-15.csv");
});

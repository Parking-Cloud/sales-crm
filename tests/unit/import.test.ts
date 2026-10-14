// Unit tests of the import file reader and plan, on the FAKE fixture
// tests/fixtures/crm-parcheggio-2026-finto.xlsx.  Run: npm run test:unit
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { categoryFor } from "../../src/lib/import/categories";
import { lossReasonFor, offerRejectionReason } from "../../src/lib/import/loss-reasons";
import { CRM_2026, proposeMapping } from "../../src/lib/import/presets";
import { buildPlan, type PlanRow } from "../../src/lib/import/transform";
import {
  cleanText,
  parseAmount,
  parseDates,
  parseEmails,
  parsePhones,
  splitDiary,
  splitMulti,
  splitNameAndRole,
} from "../../src/lib/import/values";
import { detectDelimiter, parseCsv, readXlsx } from "../../src/lib/import/workbook";

const FIXTURE = join(__dirname, "..", "..", "..", "tests", "fixtures", "crm-parcheggio-2026-finto.xlsx");

async function fixturePlan(): Promise<PlanRow[]> {
  const buffer = readFileSync(FIXTURE);
  const { sheets } = await readXlsx(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  return buildPlan(
    sheets.map((sheet) => {
      const mapping = proposeMapping(CRM_2026, sheet.name);
      assert.ok(mapping, `foglio riconosciuto: ${sheet.name}`);
      return { name: sheet.name, rows: sheet.rows, mapping, parkingId: "parcheggio-finto" };
    }),
  );
}

const byName = (plan: PlanRow[], name: string, kind?: string) =>
  plan.find((row) => (row.party.denominazione ?? `${row.party.nome} ${row.party.cognome}`).trim() === name && (!kind || row.kind === kind));

test("cell values: placeholders, spaces and the // separator", () => {
  for (const placeholder of ["Non disponibile", "Non disp", "Non disp ", "ND", "-", "  "]) assert.equal(cleanText(placeholder), null);
  assert.equal(cleanText("  Azienda Esempio Srl  "), "Azienda Esempio Srl");
  assert.deepEqual(splitMulti("a@esempio.example // b@esempio.example"), ["a@esempio.example", "b@esempio.example"]);
  assert.deepEqual(parseDates("28/09/2026//01/10/2026"), ["2026-09-28", "2026-10-01"]);
  assert.deepEqual(parseEmails("Compilare form sul sito"), { emails: [], webForm: true, invalid: [] });
  assert.deepEqual(parseEmails("Mario at esempio"), { emails: [], webForm: false, invalid: ["Mario at esempio"] });
});

test("phones stored as numbers: mobiles ok, landlines warned", () => {
  assert.deepEqual(parsePhones(3471234567), [{ value: "3471234567", warning: null }]);
  assert.match(parsePhones(212345678)[0].warning ?? "", /zero iniziale perso/);
  assert.equal(parsePhones("02 1234 5678 // 02 8765 4321").length, 2);
});

test("amounts: one number only", () => {
  assert.equal(parseAmount(250), 250);
  assert.equal(parseAmount("1.234,50 €"), 1234.5);
  assert.equal(parseAmount("250 € / 12€ giorno / 3€ ora"), null);
  assert.equal(parseAmount("230 / 210"), null);
  assert.equal(parseAmount("Inviata tabella tariffe"), null);
});

test("diary notes: one entry per date, undated text kept", () => {
  assert.deepEqual(splitDiary("24/09/2026: prima chiamata  05/10/2026: chiedono offerta"), [
    { date: "2026-09-24", text: "prima chiamata" },
    { date: "2026-10-05", text: "chiedono offerta" },
  ]);
  assert.deepEqual(splitDiary("Richiamare a fine mese"), [{ date: null, text: "Richiamare a fine mese" }]);
  assert.deepEqual(splitDiary("Nota iniziale 01/10/2026: poi questo"), [
    { date: null, text: "Nota iniziale" },
    { date: "2026-10-01", text: "poi questo" },
  ]);
});

test("categories and loss reasons", () => {
  assert.deepEqual(categoryFor("Commercialista"), { category: "Studi professionali", matched: true });
  assert.deepEqual(categoryFor("Consulenza fiscale"), { category: "Studi professionali", matched: true });
  assert.deepEqual(categoryFor("Società di consulenze"), { category: "Studi professionali", matched: true });
  assert.deepEqual(categoryFor("Ristorante pizzeria"), { category: "Ristoranti", matched: true });
  assert.deepEqual(categoryFor("Fisioterapia e riabilitazione"), { category: "Centri medici", matched: true });
  assert.deepEqual(categoryFor("Corsi di formazione"), { category: "Altro", matched: true });
  assert.deepEqual(categoryFor("Barbiere"), { category: "Altro", matched: false });
  assert.deepEqual(categoryFor("Artigianato del legno"), { category: "Altro", matched: false });
  assert.equal(lossReasonFor("si spostano con i mezzi pubblici"), "mezzi_pubblici");
  assert.equal(lossReasonFor("hanno già un parcheggio interno"), "ha_gia_parcheggio");
  assert.equal(lossReasonFor("troppo caro per loro"), "prezzo");
  assert.equal(lossReasonFor("boh"), "altro");
  assert.equal(offerRejectionReason("Prezzo troppo alto"), "prezzo");
  assert.equal(offerRejectionReason("Non ha più bisogno del posto"), "nessun_bisogno");
  assert.deepEqual(splitNameAndRole("Mario Esempio - Titolare"), { name: "Mario Esempio", role: "Titolare" });
  assert.deepEqual(splitNameAndRole("Anna-Maria Esempio"), { name: "Anna-Maria Esempio", role: null });
});

test("CSV: delimiter detection and quotes", () => {
  assert.equal(detectDelimiter("a;b;c\n1;2;3"), ";");
  assert.equal(detectDelimiter("a,b,c\n1,2,3"), ",");
  assert.deepEqual(parseCsv('nome;note\n"Azienda; Esempio";"riga ""uno"""\r\n\r\nx;\n'), [
    ["nome", "note"],
    ["Azienda; Esempio", 'riga "uno"'],
    [null],
    ["x", null],
  ]);
});

test("fixture: sheets recognized despite typo and trailing space; row counts", async () => {
  const plan = await fixturePlan();
  const anagrafica = plan.filter((row) => row.kind === "anagrafica");
  const prospect = plan.filter((row) => row.kind === "prospect");
  // 12 data rows in anagrafica, one completely empty: 11 rows; 6 in prospect, one empty: 5.
  assert.equal(anagrafica.length, 11);
  assert.equal(prospect.length, 5);
  assert.equal(plan.filter((row) => row.status === "scartata").length, 1);
  assert.equal(plan.find((row) => row.status === "scartata")?.discard, "Manca il nome dell'azienda");
  // Legend rows of the prospect sheet are ignored.
  assert.ok(!plan.some((row) => (row.party.denominazione ?? "").startsWith("Legenda")));
});

test("fixture: anagrafica rows", async () => {
  const plan = await fixturePlan();
  const first = byName(plan, "Azienda Esempio Srl", "anagrafica")!;
  assert.equal(first.party.categoria, "Studi professionali");
  assert.equal(first.party.telefono, "3471234567");
  assert.equal(first.party.email, "info@azienda-esempio.example");
  assert.equal(first.contact?.email, "amministrazione@azienda-esempio.example");
  assert.equal(first.opportunity.fase, "interessata");
  assert.equal(first.opportunity.posti_richiesti, 5);
  assert.equal(first.externalId, "Anagrafica Attvità Commerciali#73");
  assert.deepEqual(
    first.activities.map((activity) => [activity.tipo, activity.data]),
    [["chiamata", "2026-09-24"], ["email", "2026-09-24"], ["nota", "2026-09-24"], ["nota", "2026-10-05"]],
  );

  const studio = byName(plan, "Studio Prova Associati", "anagrafica")!;
  assert.equal(studio.opportunity.esito, "persa");
  assert.equal(studio.opportunity.motivo_perdita, "mezzi_pubblici");
  assert.equal(studio.party.email, null);
  assert.equal(studio.contact, null);
  assert.ok(studio.warnings.some((warning) => warning.includes("zero iniziale perso")));

  const hotel = byName(plan, "Hotel Esempio Centro")!;
  assert.equal(hotel.party.form_web_url, "https://www.hotel-esempio.example");
  assert.equal(hotel.opportunity.fase, "da_contattare");
  assert.ok(hotel.warnings.some((warning) => warning.includes("Altri telefoni")));

  const pizzeria = byName(plan, "Pizzeria Esempio")!;
  assert.equal(pizzeria.opportunity.fase, "interessata");
  assert.deepEqual(pizzeria.activities.find((activity) => activity.tipo === "nota"), {
    tipo: "nota",
    testo: "Richiamare a fine mese per parlare con il titolare",
    data: "2026-10-01",
  });

  assert.equal(byName(plan, "Centro Medico Esempio")!.opportunity.motivo_perdita, "ha_gia_parcheggio");
  assert.equal(byName(plan, "Formazione Esempio Srl")!.opportunity.fase, "contattata");
  const bottega = byName(plan, "Bottega Esempio")!;
  assert.equal(bottega.party.categoria, "Altro");
  assert.ok(bottega.warnings.some((warning) => warning.includes("non riconosciuto")));

  const repeated = byName(plan, "Azienda Esempio S.r.l.")!;
  assert.equal(repeated.linkTo, first.ref);

  const agency = byName(plan, "Agenzia Prova Immobiliare")!;
  assert.equal(agency.opportunity.motivo_perdita, "prezzo");
  assert.ok(agency.warnings.some((warning) => warning.includes("Data sospetta") && warning.includes("15/03/2025")));
  assert.ok(!first.warnings.some((warning) => warning.includes("Data sospetta")));
});

test("fixture: prospect rows", async () => {
  const plan = await fixturePlan();
  const accepted = byName(plan, "Azienda Esempio Srl", "prospect")!;
  assert.equal(accepted.linkTo, byName(plan, "Azienda Esempio Srl", "anagrafica")!.ref);
  assert.equal(accepted.offer?.stato, "accettata");
  assert.equal(accepted.offer?.importo, 250);
  assert.equal(accepted.opportunity.esito, "vinta");

  const person = plan.find((row) => row.kind === "prospect" && row.party.cognome === "Prova" && row.party.nome === "Giulia")!;
  assert.equal(person.party.tipo, "persona");
  assert.equal(person.needsTypeChoice, true);
  assert.equal(person.party.email, null);
  assert.equal(person.offer?.stato, "inviata");
  assert.equal(person.offer?.importo, 0);
  assert.equal(person.offer?.condizioni.testo_originale, "250 € / 12€ giorno / 3€ ora");
  assert.equal(person.offer?.posti, null);

  const rejected = byName(plan, "Studio Prova Associati", "prospect")!;
  assert.equal(rejected.offer?.stato, "rifiutata");
  assert.equal(rejected.opportunity.motivo_perdita, "prezzo");
  assert.equal(rejected.contact?.ruolo, "Office manager");

  const company = byName(plan, "Ditta Esempio Snc")!;
  assert.equal(company.party.tipo, "azienda");
  assert.equal(company.offer?.stato, "inviata");
  assert.ok(company.warnings.some((warning) => warning.includes("Importo")));

  const marco = plan.find((row) => row.kind === "prospect" && row.party.nome === "Marco")!;
  assert.equal(marco.opportunity.motivo_perdita, "nessun_bisogno");
  assert.equal(marco.party.telefono, "333 1112223");
});

test("supabase/tests/import.sql embeds the current plan of the fixture", async () => {
  const { embeddedBlock, fixturePlan, planBlock, SQL_TEST } = await import("../fixtures/build-import-plan");
  const embedded = embeddedBlock(readFileSync(SQL_TEST, "utf8"));
  assert.equal(embedded, planBlock(await fixturePlan()), "run: npm run test:fixtures");
});

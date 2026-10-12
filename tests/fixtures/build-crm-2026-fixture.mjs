// Builds tests/fixtures/crm-parcheggio-2026-finto.xlsx: a FAKE file with the
// structure of the "CRM parcheggio, formato 2026" preset and all its known
// defects. Every name, email, phone and site below is invented.
//
//   node tests/fixtures/build-crm-2026-fixture.mjs

import ExcelJS from "exceljs";
import { fileURLToPath } from "node:url";

const out = fileURLToPath(new URL("./crm-parcheggio-2026-finto.xlsx", import.meta.url));
const workbook = new ExcelJS.Workbook();
workbook.created = new Date(Date.UTC(2026, 9, 12));
workbook.modified = workbook.created;

// Sheet name with the typo and the trailing space of the source format.
const anagrafica = workbook.addWorksheet("Anagrafica Attvità Commerciali ");
anagrafica.addRow([
  "Stato", "ID_Contatto", "Nome Azienda", "Settore", "Nome Referente", "Ruolo Referente", "Sito", "Email",
  "Telefono", "Data Primo contatto", "Data Ultimo contatto", "Email", "Chiamata", "Note", "", "Numero Posti Potenziali",
]);

const d = (y, m, day) => new Date(Date.UTC(y, m - 1, day));
const rows = [
  // 2: very interested, phone stored as a number (mobile), two emails, diary notes
  ["Very interested", 73, "Azienda Esempio Srl ", "Commercialista ", "Mario Esempio", "Titolare", "www.azienda-esempio.example",
    "info@azienda-esempio.example // amministrazione@azienda-esempio.example", 3471234567, d(2026, 9, 24), d(2026, 10, 5),
    "Inviata", "Chiamati", "24/09/2026: prima chiamata, interessati  05/10/2026: chiedono un'offerta per 5 posti", null, 5],
  // 3: not interested, landline stored as a number (leading zero lost), placeholders
  ["Not interested", 301, "Studio Prova Associati", "consulenza del lavoro", "Non disp ", null, "studio-prova.example",
    "Non disponibile", 212345678, "25/09/2026", null, "Da inviare", "Chiamati", "25/09/2026: si spostano con i mezzi pubblici", null, "ND"],
  // 4: empty status, web form instead of email, two phones without a contact person
  [null, 659, "Hotel Esempio Centro", "Hotel", null, null, "https://www.hotel-esempio.example",
    "Compilare form sul sito", "02 1234 5678 // 02 8765 4321", null, null, null, "Da Chiamare", null, null, null],
  // 5: interested, two dates in one cell, note without a date
  ["Interested", 660, "Pizzeria Esempio", "Ristorante pizzeria", "Luca Prova", "Gestore", null,
    "pizzeria.esempio@example.com", "-", "28/09/2026//01/10/2026", "01/10/2026", "Inviata", null,
    "Richiamare a fine mese per parlare con il titolare", null, null],
  // 6: completely empty row
  [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  // 7: data without a company name: discarded
  [null, 700, "   ", "Ufficio", null, null, null, "senza.nome@example.com", null, null, null, null, null, null, null, null],
  // 8: not interested, already has a parking
  ["Not interested", 701, "Centro Medico Esempio", "Fisioterapia e riabilitazione", "Sara Esempio", "Segreteria", null,
    "segreteria@centro-medico.example", "0298765432", "02/10/2026", "02/10/2026", null, "Chiamati",
    "02/10/2026: hanno già un parcheggio interno per i dipendenti", null, null],
  // 9: contacted by date only, category from keywords
  [null, 702, "Formazione Esempio Srl", "Corsi di formazione", null, null, null, null, null, "29/09/2026", null, null, null, null, null, null],
  // 10: sector without a matching keyword
  [null, 703, "Bottega Esempio", "Artigianato del legno", null, null, null, null, null, null, null, null, null, null, null, null],
  // 11: the same company again (row 2)
  ["Interested", 704, "Azienda Esempio S.r.l.", "Commercialista", "Paolo Esempio", "Amministrazione", null,
    null, null, "03/10/2026", null, null, "Chiamati", null, null, null],
  // 12: not interested for price, with a date one year off
  ["Not interested", 705, "Agenzia Prova Immobiliare", "Agenzia immobiliare", null, null, null, "info@agenzia-prova.example",
    "+39 02 5555 1234", "30/09/2026", null, null, "Chiamati", "15/03/2025: troppo caro per loro", null, null],
  // 13: very interested, IT company (non continuous IDs)
  ["Very interested", 1200, "Informatica Esempio Spa", "Fornitore informatico", "Elena Prova", "Office manager", "informatica-esempio.example/contatti",
    "elena.prova@informatica-esempio.example", "02-4444-5555", "01/10/2026", "06/10/2026", "Inviata", "Chiamati", null, null, 12],
];
rows.forEach((row) => anagrafica.addRow(row));

// Prospect sheet: legend in rows 2-3, headers in row 5, data from column B.
const prospect = workbook.addWorksheet("Gestione Prospectrichieste");
prospect.getCell("B1").value = "Gestione prospect e richieste";
prospect.getCell("B2").value = "Legenda: ACCETTATA = offerta firmata, RIFIUTATA = non interessato";
prospect.getCell("B3").value = "IN ATTESA = in attesa di risposta";
const headers = ["Prospect", "Email", "Telefono", "Nome e Ruolo Referente", "Data Offerta", "Data sollecito", "Note",
  "Offerta", "N posti 7/7", "Stato", "Feedback Cliente"];
headers.forEach((header, i) => (prospect.getRow(5).getCell(i + 2).value = header));

const vlookup = (row, column, result) => ({
  formula: `VLOOKUP(B${row},'Anagrafica Attvità Commerciali '!C:I,${column},FALSE)`,
  result,
});
const prospects = [
  // 6: in anagrafica, accepted, numeric amount, VLOOKUP with cached values
  ["Azienda Esempio Srl", vlookup(6, 6, "info@azienda-esempio.example"), vlookup(6, 7, 3471234567), "Mario Esempio - Titolare",
    d(2026, 10, 6), "10/10/2026", "06/10/2026: inviata offerta per 3 posti", 250, 3, "ACCETTATA", "Soddisfatti"],
  // 7: person not in anagrafica, VLOOKUP errors, amount as text, ND seats
  ["Giulia Prova", vlookup(7, 6, { error: "#N/A" }), vlookup(7, 7, { error: "#N/A" }), null,
    "07/10/2026", null, null, "250 € / 12€ giorno / 3€ ora", "ND", "IN ATTESA", null],
  // 8: in anagrafica, rejected for price, two amounts
  ["Studio Prova Associati", vlookup(8, 6, "Non disponibile"), vlookup(8, 7, 212345678), "Anna Esempio - Office manager",
    "08/10/2026", null, null, "230 / 210", 2, "RIFIUTATA", "Prezzo troppo alto rispetto al concorrente"],
  // 9: company not in anagrafica, no amount, empty status
  ["Ditta Esempio Snc", null, null, null, null, null, null, "Inviata tabella tariffe", null, null, null],
  // 10: empty row
  [null, null, null, null, null, null, null, null, null, null, null],
  // 11: person, rejected, no longer needed
  ["Marco Esempio", null, "333 1112223", null, "09/10/2026", null, null, "180", 1, "RIFIUTATA", "Non ha più bisogno del posto"],
];
prospects.forEach((values, r) => {
  const row = prospect.getRow(6 + r);
  values.forEach((value, i) => (row.getCell(i + 2).value = value));
});

await workbook.xlsx.writeFile(out);
console.log(`Scritto ${out}`);

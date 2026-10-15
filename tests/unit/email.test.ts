// Unit tests of the email helpers (block 1a-7): variables, rendering,
// products, signature, footer, Gmail link.  Run: npm run test:unit
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFooter,
  formatProducts,
  formatSignature,
  gmailComposeUrl,
  hasSignature,
  renderTemplate,
  unknownVariables,
  withFooter,
} from "../../src/lib/email/template";

test("variables: unknown ones listed once, in order", () => {
  assert.deepEqual(unknownVariables("Ciao {azienda}, {nome} e {x}, ancora {nome}. {firma}"), ["nome", "x"]);
  assert.deepEqual(unknownVariables("Nessuna variabile"), []);
  assert.deepEqual(unknownVariables("{}"), [""]);
});

test("rendering: known variables replaced, missing ones reported, unknown left as they are", () => {
  const out = renderTemplate("Gentile {referente}, per {azienda} al {parcheggio}. {sconosciuta}\n{firma}", {
    azienda: "Azienda Esempio Srl",
    referente: "",
    parcheggio: "Parcheggio Esempio",
    firma: "Mario Prova",
  });
  assert.equal(out.text, "Gentile , per Azienda Esempio Srl al Parcheggio Esempio. {sconosciuta}\nMario Prova");
  assert.deepEqual(out.missing, ["referente"]);
  // A value containing braces is not replaced again.
  assert.equal(renderTemplate("{azienda}", { azienda: "Studio {firma} Srl" }).text, "Studio {firma} Srl");
});

test("products: one line each, price with VAT note and period, band and days", () => {
  assert.equal(
    formatProducts([
      { nome: "Full Time", giorni: "7/7", oraDa: null, oraA: null, periodo: "mese", prezzoNetto: 120 },
      { nome: "Diurno", giorni: "5/7", oraDa: "07:00:00", oraA: "20:00:00", periodo: "mese", prezzoNetto: 1234.5 },
      { nome: "Carnet", giorni: null, oraDa: null, oraA: null, periodo: null, prezzoNetto: null },
    ]),
    "- Full Time (7/7): 120,00 € + IVA al mese\n- Diurno (5/7, 07:00-20:00): 1.234,50 € + IVA al mese\n- Carnet: prezzo su richiesta",
  );
  assert.equal(formatProducts([]), "");
});

test("signature: needs the name, empty lines dropped", () => {
  assert.equal(hasSignature({ nome: " ", ruolo: "x", telefono: null, testo: null }), false);
  assert.equal(formatSignature(null), "");
  assert.equal(
    formatSignature({ nome: "Mario Prova", ruolo: "Commerciale", telefono: null, testo: "Parking Cloud" }),
    "Mario Prova\nCommerciale\nParking Cloud",
  );
});

test("footer: who we are, how we got the contact (by basis, with the date), how to opt out", () => {
  const footer = buildFooter({
    ragioneSociale: "Societa Esempio Srl",
    emailOpposizione: "opposizione@example.com",
    permesso: { base: "richiesta_in_chiamata", data: "2026-10-14T10:00:00Z" },
  });
  assert.match(footer, /Societa Esempio Srl \(Parking Cloud\)/);
  assert.match(footer, /ci ha chiesto queste informazioni al telefono il 14\/10\/2026\./);
  assert.match(footer, /risponda "NO" a questa email oppure scriva a opposizione@example\.com/);
  assert.match(
    buildFooter({ ragioneSociale: "S", emailOpposizione: "o@example.com", permesso: { base: "contatto_in_entrata", data: "2026-10-01T10:00:00Z" } }),
    /ci ha scritto per primo il 01\/10\/2026/,
  );
  assert.match(
    buildFooter({ ragioneSociale: "S", emailOpposizione: "o@example.com", permesso: { base: "consenso", data: "2026-10-01T10:00:00Z" } }),
    /consenso a ricevere nostre comunicazioni il 01\/10\/2026/,
  );
  assert.equal(withFooter("Testo\n\n\n", "--\nPiede"), "Testo\n\n--\nPiede");
});

test("Gmail link: encoded fields, special characters, body left out above the limit", () => {
  const short = gmailComposeUrl({ to: "mario.prova@example.com", subject: "Parcheggio & abbonamenti: 20% di sconto?", body: "Riga 1\nRiga 2 è più #3" });
  assert.equal(short.withBody, true);
  const url = new URL(short.url);
  assert.equal(url.origin + url.pathname, "https://mail.google.com/mail/");
  assert.equal(url.searchParams.get("view"), "cm");
  assert.equal(url.searchParams.get("to"), "mario.prova@example.com");
  assert.equal(url.searchParams.get("su"), "Parcheggio & abbonamenti: 20% di sconto?");
  assert.equal(url.searchParams.get("body"), "Riga 1\nRiga 2 è più #3");
  const long = gmailComposeUrl({ to: "a@example.com", subject: "Oggetto", body: "x".repeat(3000) });
  assert.equal(long.withBody, false);
  assert.equal(new URL(long.url).searchParams.get("body"), null);
  assert.equal(new URL(long.url).searchParams.get("su"), "Oggetto");
  assert.ok(long.url.length <= 2000);
  // The limit counts the encoded length: accented letters weigh more.
  const accents = gmailComposeUrl({ to: "a@example.com", subject: "O", body: "è".repeat(400) });
  assert.equal(accents.withBody, false);
});

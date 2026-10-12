// Turns mapped sheet rows into an import plan: one PlanRow per data row, with
// the party, contact, opportunity, activities and offer to create, plus
// warnings and discard reasons. Pure and serializable: it runs on the server
// for the preview and is sent back, possibly edited, for the import.
// Spec: "Ristrutturazione dell'Excel nel CRM" and block 1a-4 rules.

import { categoryFor } from "./categories";
import { columnIndex } from "./columns";
import { lossReasonFor, offerRejectionReason, type LossReason } from "./loss-reasons";
import type { SheetKind, SheetMapping } from "./presets";
import {
  cleanText,
  looksLikeCompany,
  nameKey,
  parseAmount,
  parseCount,
  parseDates,
  parseEmails,
  parsePhones,
  splitDiary,
  splitMulti,
  splitNameAndRole,
  splitPersonName,
  type Cell,
} from "./values";

export type RowStatus = "valida" | "avvisi" | "doppione" | "scartata";
export type Decision = "crea" | "unisci" | "escludi";

export type PlannedActivity = {
  tipo: "chiamata" | "email" | "nota";
  testo: string | null;
  data: string | null;
};

export type PlannedOffer = {
  stato: "inviata" | "accettata" | "rifiutata";
  inviata_il: string | null;
  accettata_il: string | null;
  motivo_rifiuto: string | null;
  condizioni: Record<string, string | null>;
  importo: number;
  posti: number | null;
};

export type DuplicateHit = {
  livello: "blocco" | "avviso";
  motivo: string;
  party_id: string | null;
  nome: string | null;
};

export type PlanRow = {
  ref: string;
  sheet: string;
  kind: SheetKind;
  row: number;
  status: RowStatus;
  discard: string | null;
  warnings: string[];
  party: {
    tipo: "azienda" | "persona";
    denominazione: string | null;
    nome: string | null;
    cognome: string | null;
    categoria: string | null;
    sito: string | null;
    telefono: string | null;
    email: string | null;
    form_web_url: string | null;
  };
  externalId: string | null;
  contact: { nome: string | null; cognome: string | null; ruolo: string | null; email: string | null; telefono: string | null } | null;
  opportunity: {
    fase: "da_contattare" | "contattata" | "interessata" | "offerta_inviata" | "vinta";
    esito: "aperta" | "vinta" | "persa";
    motivo_perdita: LossReason | null;
    posti_richiesti: number | null;
  };
  activities: PlannedActivity[];
  offer: PlannedOffer | null;
  // Prospect row matching a party of the anagrafica sheet of the same file.
  linkTo: string | null;
  // Not in the anagrafica: the user confirms company or person.
  needsTypeChoice: boolean;
  duplicates: DuplicateHit[];
  decision: Decision;
  mergeInto: string | null;
  parkingId: string | null;
  dates: string[];
};

export type SheetInput = {
  name: string;
  rows: Cell[][];
  mapping: SheetMapping;
  parkingId: string | null;
};

const SUSPICIOUS_DAYS = 183;

function reader(rows: Cell[][], mapping: SheetMapping) {
  const indexes = Object.fromEntries(
    Object.entries(mapping.columns).map(([key, letter]) => [key, letter ? columnIndex(letter) : -1]),
  );
  return (row: Cell[], key: string): Cell => {
    const index = indexes[key] ?? -1;
    return index >= 0 ? (row[index] ?? null) : null;
  };
}

const isBlankRow = (row: Cell[]) => row.every((cell) => cleanText(cell) === null);

function newRow(sheet: SheetInput, kind: SheetKind, rowNumber: number): PlanRow {
  return {
    ref: `${sheet.name.trim()}:${rowNumber}`,
    sheet: sheet.name.trim(),
    kind,
    row: rowNumber,
    status: "valida",
    discard: null,
    warnings: [],
    party: { tipo: "azienda", denominazione: null, nome: null, cognome: null, categoria: null, sito: null, telefono: null, email: null, form_web_url: null },
    externalId: null,
    contact: null,
    opportunity: { fase: "da_contattare", esito: "aperta", motivo_perdita: null, posti_richiesti: null },
    activities: [],
    offer: null,
    linkTo: null,
    needsTypeChoice: false,
    duplicates: [],
    decision: "crea",
    mergeInto: null,
    parkingId: sheet.parkingId,
    dates: [],
  };
}

// Emails, phones and site shared by both sheets.
function applyChannels(plan: PlanRow, siteCell: Cell, emailCell: Cell, phoneCell: Cell) {
  const sites = splitMulti(siteCell);
  plan.party.sito = sites[0] ?? null;
  if (sites.length > 1) plan.warnings.push(`Più siti nella cella: tenuto ${sites[0]}`);

  const emails = parseEmails(emailCell);
  plan.party.email = emails.emails[0] ?? null;
  const extraEmails = emails.emails.slice(1);
  if (emails.webForm) {
    if (plan.party.sito) plan.party.form_web_url = plan.party.sito;
    else plan.warnings.push("Indicato “Compilare form sul sito” ma manca il sito");
  }
  emails.invalid.forEach((value) => plan.warnings.push(`Email non valida scartata: ${value}`));

  const phones = parsePhones(phoneCell);
  phones.forEach((phone) => phone.warning && plan.warnings.push(phone.warning));
  const validPhones = phones.filter((phone) => !phone.warning?.startsWith("Telefono non valido")).map((phone) => phone.value);
  plan.party.telefono = validPhones[0] ?? null;
  const extraPhones = validPhones.slice(1);

  // Extra emails and phones go to the contact person, when there is one.
  if (plan.contact) {
    if (!plan.contact.email && extraEmails.length > 0) plan.contact.email = extraEmails.shift() ?? null;
    if (extraPhones.length > 0) plan.contact.telefono = extraPhones.join(", ");
  } else if (extraPhones.length > 0 || extraEmails.length > 0) {
    plan.warnings.push("Altri telefoni o email nella cella non importati: manca un referente a cui associarli");
    return;
  }
  if (extraEmails.length > 0) plan.warnings.push(`Email in più non importate: ${extraEmails.join(", ")}`);
}

function diaryActivities(plan: PlanRow, noteCell: Cell, fallbackDate: string | null): string | null {
  const entries = splitDiary(noteCell);
  entries.forEach((entry) => {
    plan.activities.push({ tipo: "nota", testo: entry.text, data: entry.date ?? fallbackDate });
    if (entry.date) plan.dates.push(entry.date);
  });
  return entries.map((entry) => entry.text).join(" ") || null;
}

// ---------------------------------------------------------------------------
// Anagrafica sheet
// ---------------------------------------------------------------------------

function anagraficaRow(sheet: SheetInput, cells: Cell[], rowNumber: number): PlanRow {
  const get = reader(sheet.rows, sheet.mapping);
  const plan = newRow(sheet, "anagrafica", rowNumber);
  const name = cleanText(get(cells, "nome"));
  if (!name) {
    plan.status = "scartata";
    plan.discard = "Manca il nome dell'azienda";
    plan.decision = "escludi";
    return plan;
  }
  plan.party.denominazione = name;

  const id = cleanText(get(cells, "id_contatto"));
  if (id) plan.externalId = `${sheet.name.trim()}#${id}`;

  const sector = cleanText(get(cells, "settore"));
  if (sector) {
    const { category, matched } = categoryFor(sector);
    plan.party.categoria = category;
    if (!matched) plan.warnings.push(`Settore “${sector}” non riconosciuto: categoria Altro`);
  }

  const refName = cleanText(get(cells, "referente_nome"));
  const refRole = cleanText(get(cells, "referente_ruolo"));
  if (refName || refRole) {
    const split = splitPersonName(refName);
    plan.contact = { ...split, ruolo: refRole, email: null, telefono: null };
  }

  applyChannels(plan, get(cells, "sito"), get(cells, "email"), get(cells, "telefono"));

  const firstDates = parseDates(get(cells, "data_primo"));
  const lastDates = parseDates(get(cells, "data_ultimo"));
  plan.dates.push(...firstDates, ...lastDates);
  const firstDate = firstDates[0] ?? lastDates[0] ?? null;
  const lastDate = lastDates[lastDates.length - 1] ?? firstDates[firstDates.length - 1] ?? null;

  const called = (cleanText(get(cells, "chiamata")) ?? "").toLowerCase() === "chiamati";
  const emailed = (cleanText(get(cells, "email_stato")) ?? "").toLowerCase() === "inviata";
  if (called) plan.activities.push({ tipo: "chiamata", testo: "Chiamata (da import Excel)", data: firstDate });
  if (emailed) plan.activities.push({ tipo: "email", testo: "Email inviata (da import Excel)", data: firstDate });
  const notes = diaryActivities(plan, get(cells, "note"), lastDate);

  plan.opportunity.posti_richiesti = parseCount(get(cells, "posti"));

  const status = (cleanText(get(cells, "stato")) ?? "").toLowerCase();
  if (status === "very interested" || status === "interested") {
    plan.opportunity.fase = "interessata";
  } else if (status === "not interested") {
    plan.opportunity.fase = "contattata";
    plan.opportunity.esito = "persa";
    plan.opportunity.motivo_perdita = lossReasonFor(notes);
  } else {
    if (status) plan.warnings.push(`Stato “${status}” non riconosciuto: considerato vuoto`);
    plan.opportunity.fase = called || emailed || firstDates.length > 0 ? "contattata" : "da_contattare";
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Prospect sheet
// ---------------------------------------------------------------------------

function prospectRow(sheet: SheetInput, cells: Cell[], rowNumber: number, anagrafica: Map<string, PlanRow>): PlanRow {
  const get = reader(sheet.rows, sheet.mapping);
  const plan = newRow(sheet, "prospect", rowNumber);
  const name = cleanText(get(cells, "prospect"));
  if (!name) {
    plan.status = "scartata";
    plan.discard = "Manca il nome del prospect";
    plan.decision = "escludi";
    return plan;
  }

  const match = anagrafica.get(nameKey(name));
  if (match && match.status !== "scartata") {
    plan.linkTo = match.ref;
    plan.party = { ...match.party };
    plan.decision = "unisci";
  } else if (looksLikeCompany(name)) {
    plan.party.denominazione = name;
    plan.needsTypeChoice = true;
    plan.warnings.push("Non presente in anagrafica: conferma azienda o persona");
  } else {
    plan.party.tipo = "persona";
    Object.assign(plan.party, splitPersonName(name));
    plan.needsTypeChoice = true;
    plan.warnings.push("Non presente in anagrafica: proposto come persona, controlla nome e cognome");
  }

  const { name: refName, role } = splitNameAndRole(get(cells, "referente"));
  if (refName || role) plan.contact = { ...splitPersonName(refName), ruolo: role, email: null, telefono: null };

  if (!plan.linkTo) applyChannels(plan, null, get(cells, "email"), get(cells, "telefono"));

  const offerDates = parseDates(get(cells, "data_offerta"));
  const reminderDates = parseDates(get(cells, "data_sollecito"));
  plan.dates.push(...offerDates, ...reminderDates);
  const offerDate = offerDates[0] ?? null;
  const reminderDate = reminderDates[reminderDates.length - 1] ?? null;

  if (offerDate) plan.activities.push({ tipo: "email", testo: "Offerta inviata (da import Excel)", data: offerDate });
  if (reminderDate) plan.activities.push({ tipo: "nota", testo: "Sollecito (da import Excel)", data: reminderDate });
  diaryActivities(plan, get(cells, "note"), reminderDate ?? offerDate);

  const feedback = cleanText(get(cells, "feedback"));
  const offerText = cleanText(get(cells, "offerta"));
  const amount = parseAmount(get(cells, "offerta"));
  const postiRaw = cleanText(get(cells, "posti"));
  const posti = parseCount(get(cells, "posti"));
  if (offerText && amount === null) {
    plan.warnings.push(`Importo dell'offerta non leggibile (“${offerText}”): 0 e testo originale nelle condizioni`);
  }

  const status = (cleanText(get(cells, "stato")) ?? "").toUpperCase();
  const offer: PlannedOffer = {
    stato: "inviata",
    inviata_il: offerDate,
    accettata_il: null,
    motivo_rifiuto: null,
    condizioni: { testo_originale: offerText, posti_7_7: postiRaw, feedback, origine: "Import Excel" },
    importo: amount ?? 0,
    posti,
  };
  plan.opportunity.posti_richiesti = posti;
  if (status === "ACCETTATA") {
    offer.stato = "accettata";
    offer.accettata_il = reminderDate ?? offerDate;
    plan.opportunity.fase = "vinta";
    plan.opportunity.esito = "vinta";
  } else if (status === "RIFIUTATA") {
    offer.stato = "rifiutata";
    offer.motivo_rifiuto = feedback;
    plan.opportunity.fase = "offerta_inviata";
    plan.opportunity.esito = "persa";
    plan.opportunity.motivo_perdita = offerRejectionReason(feedback);
  } else {
    if (status && status !== "IN ATTESA") plan.warnings.push(`Stato offerta “${status}” non riconosciuto: considerata inviata`);
    plan.opportunity.fase = "offerta_inviata";
    if (feedback) plan.activities.push({ tipo: "nota", testo: `Feedback: ${feedback}`, data: reminderDate ?? offerDate });
  }
  plan.offer = offer;
  return plan;
}

// ---------------------------------------------------------------------------
// Whole plan
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function buildPlan(sheets: SheetInput[]): PlanRow[] {
  const ordered = [...sheets].sort((a, b) => (a.mapping.kind === b.mapping.kind ? 0 : a.mapping.kind === "anagrafica" ? -1 : 1));
  const rows: PlanRow[] = [];
  const byName = new Map<string, PlanRow>();

  for (const sheet of ordered) {
    const firstDataRow = sheet.mapping.headerRow; // 0-based index of the row after the headers
    for (let index = firstDataRow; index < sheet.rows.length; index++) {
      const cells = sheet.rows[index] ?? [];
      if (isBlankRow(cells)) continue;
      const rowNumber = index + 1;
      if (sheet.mapping.kind === "anagrafica") {
        const plan = anagraficaRow(sheet, cells, rowNumber);
        const key = nameKey(plan.party.denominazione);
        const first = key ? byName.get(key) : undefined;
        if (first && plan.status !== "scartata") {
          // Same company twice in the sheet: one party, the second row adds its data.
          plan.linkTo = first.ref;
          plan.decision = "unisci";
          plan.warnings.push(`Azienda ripetuta nel file (riga ${first.row}): i dati vanno sullo stesso soggetto`);
        } else if (key && plan.status !== "scartata") {
          byName.set(key, plan);
        }
        rows.push(plan);
      } else {
        rows.push(prospectRow(sheet, cells, rowNumber, byName));
      }
    }
  }

  // Dates far from the others in the file (e.g. a 2025 among 2026 dates).
  const all = rows.flatMap((row) => row.dates.map((date) => Date.parse(date)));
  if (all.length >= 3) {
    const middle = median(all);
    for (const row of rows) {
      const odd = row.dates.filter((date) => Math.abs(Date.parse(date) - middle) > SUSPICIOUS_DAYS * 86_400_000);
      if (odd.length > 0) {
        row.warnings.push(`Data sospetta, lontana dalle altre del file: ${odd.map((date) => date.split("-").reverse().join("/")).join(", ")}`);
      }
    }
  }

  for (const row of rows) {
    if (row.status !== "scartata" && row.warnings.length > 0) row.status = "avvisi";
  }
  return rows;
}

// Status after the duplicate check and the user's choices.
export function finalStatus(row: PlanRow): RowStatus {
  if (row.status === "scartata") return "scartata";
  if (row.duplicates.length > 0) return "doppione";
  return row.warnings.length > 0 ? "avvisi" : "valida";
}

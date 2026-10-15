// Email templates (CRM-21): variables, rendering, products list, signature,
// mandatory footer and the Gmail compose link (CRM-22, no Gmail API in 1a).
// Pure: unit tested. Relative imports only (the unit tests run without the
// "@/" alias).

export const TEMPLATE_VARIABLES = ["azienda", "referente", "parcheggio", "indirizzo_parcheggio", "prodotti_prezzi", "firma"] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export const TEMPLATE_VARIABLE_LABELS: Record<TemplateVariable, string> = {
  azienda: "Nome dell'azienda o della persona",
  referente: "Nome e cognome del contatto",
  parcheggio: "Nome del parcheggio",
  indirizzo_parcheggio: "Indirizzo del parcheggio",
  prodotti_prezzi: "Prodotti e prezzi dal listino del parcheggio",
  firma: "Firma di chi scrive",
};

export const TEMPLATE_USES = ["uffici", "attivita_commerciali", "offerta"] as const;
export type TemplateUse = (typeof TEMPLATE_USES)[number];
export const TEMPLATE_USE_LABELS: Record<TemplateUse, string> = {
  uffici: "Uffici",
  attivita_commerciali: "Attività commerciali",
  offerta: "Offerta",
};

const PLACEHOLDER = /\{([^{}]*)\}/g;

// Placeholders that are not known variables, in order, without repetitions
// (same rule as public.template_unknown_variables).
export function unknownVariables(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER)) {
    const name = match[1];
    if (!(TEMPLATE_VARIABLES as readonly string[]).includes(name) && !out.includes(name)) out.push(name);
  }
  return out;
}

export type TemplateValues = Partial<Record<TemplateVariable, string | null>>;

// Replaces the known variables; reports the ones used without a value (left
// empty in the text, to be filled by hand).
export function renderTemplate(text: string, values: TemplateValues): { text: string; missing: TemplateVariable[] } {
  const missing: TemplateVariable[] = [];
  const rendered = text.replace(PLACEHOLDER, (whole, name: string) => {
    if (!(TEMPLATE_VARIABLES as readonly string[]).includes(name)) return whole;
    const value = values[name as TemplateVariable]?.trim();
    if (!value) {
      if (!missing.includes(name as TemplateVariable)) missing.push(name as TemplateVariable);
      return "";
    }
    return value;
  });
  return { text: rendered, missing };
}

export type ProductLine = {
  nome: string;
  giorni: string | null;
  oraDa: string | null;
  oraA: string | null;
  periodo: "ora" | "giorno" | "mese" | "anno" | null;
  prezzoNetto: number | null;
};

const PRICE = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" });
const PER: Record<NonNullable<ProductLine["periodo"]>, string> = { ora: "all'ora", giorno: "al giorno", mese: "al mese", anno: "all'anno" };

// One line per product: "- Full Time (7/7, 07:00-20:00): 120,00 € + IVA al mese".
export function formatProducts(products: ProductLine[]): string {
  return products
    .map((product) => {
      const band = product.oraDa || product.oraA ? `${product.oraDa?.slice(0, 5) ?? ""}-${product.oraA?.slice(0, 5) ?? ""}` : null;
      const details = [product.giorni, band].filter(Boolean).join(", ");
      const price =
        product.prezzoNetto === null
          ? "prezzo su richiesta"
          : `${PRICE.format(product.prezzoNetto).replace(/[\u00a0\u202f]/g, " ")} + IVA${product.periodo ? ` ${PER[product.periodo]}` : ""}`;
      return `- ${product.nome}${details ? ` (${details})` : ""}: ${price}`;
    })
    .join("\n");
}

export type Signature = { nome: string | null; ruolo: string | null; telefono: string | null; testo: string | null };

export function hasSignature(signature: Signature | null): boolean {
  return Boolean(signature?.nome?.trim());
}

export function formatSignature(signature: Signature | null): string {
  if (!signature || !hasSignature(signature)) return "";
  return [signature.nome, signature.ruolo, signature.telefono, signature.testo]
    .map((line) => line?.trim())
    .filter(Boolean)
    .join("\n");
}

export type PermissionBasis = "richiesta_in_chiamata" | "contatto_in_entrata" | "consenso";
export const PERMISSION_BASIS_LABELS: Record<PermissionBasis, string> = {
  richiesta_in_chiamata: "Richiesta in chiamata",
  contatto_in_entrata: "Ha scritto per primo",
  consenso: "Consenso registrato",
};

export type FooterInput = { ragioneSociale: string; emailOpposizione: string };

// Mandatory footer (B3), added to every email and not editable: who we are
// and how to opt out. Since block 1a-8 it no longer says how we got the
// contact.
export function buildFooter(input: FooterInput): string {
  return [
    "--",
    `Questa email Le arriva da ${input.ragioneSociale.trim()} (Parking Cloud).`,
    `Se non desidera ricevere altre comunicazioni, risponda "NO" a questa email oppure scriva a ${input.emailOpposizione.trim()}.`,
  ].join("\n");
}

// Body as sent: the text written plus the footer.
export function withFooter(body: string, footer: string): string {
  return `${body.replace(/\s+$/, "")}\n\n${footer}`;
}

// Gmail compose link (https://mail.google.com/mail/?view=cm). Long links are
// cut by browsers and by Gmail: above the limit the body is left out, to be
// pasted from the clipboard.
export const GMAIL_URL_LIMIT = 2000;

export function gmailComposeUrl(input: { to: string; subject: string; body: string }, limit = GMAIL_URL_LIMIT): { url: string; withBody: boolean } {
  const base = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(input.to)}&su=${encodeURIComponent(input.subject)}`;
  const full = `${base}&body=${encodeURIComponent(input.body)}`;
  return full.length <= limit ? { url: full, withBody: true } : { url: base, withBody: false };
}

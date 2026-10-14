import { partyName } from "@/lib/parties/labels";
import { facilityAddress } from "@/lib/parking/validation";
import { createClient } from "@/lib/supabase/server";
import { formatProducts, formatSignature, type PermissionBasis, type Signature, type TemplateUse, type TemplateValues } from "./template";

// Reads for templates, email settings, signatures, permissions and the
// "Prepara email" page (RLS applies).

function fail(table: string, error: { code?: string; message: string }): never {
  throw new Error(`${table}: ${error.code ?? error.message}`);
}

type UserRef = { nome: string | null; email: string } | null;
const userName = (user: UserRef) => (user ? user.nome?.trim() || user.email : null);

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export type TemplateVersion = {
  id: string;
  famigliaId: string;
  versione: number;
  nome: string;
  uso: TemplateUse;
  oggetto: string;
  corpo: string;
  attivo: boolean;
  creataIl: string;
  autore: string | null;
};

const TEMPLATE_COLUMNS =
  "id, famiglia_id, versione, nome, uso, oggetto, corpo, attivo, created_at, autore:users!email_templates_created_by_fkey(nome, email)";

type TemplateRow = {
  id: string;
  famiglia_id: string;
  versione: number;
  nome: string;
  uso: TemplateUse;
  oggetto: string;
  corpo: string;
  attivo: boolean;
  created_at: string;
  autore: UserRef;
};

function toVersion(row: TemplateRow): TemplateVersion {
  return {
    id: row.id,
    famigliaId: row.famiglia_id,
    versione: row.versione,
    nome: row.nome,
    uso: row.uso,
    oggetto: row.oggetto,
    corpo: row.corpo,
    attivo: row.attivo,
    creataIl: row.created_at,
    autore: userName(row.autore),
  };
}

// The latest version of every template, by name.
export async function listTemplates(options: { onlyActive?: boolean } = {}): Promise<TemplateVersion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("email_templates").select(TEMPLATE_COLUMNS).order("versione", { ascending: false });
  if (error) fail("email_templates", error);
  const latest = new Map<string, TemplateVersion>();
  for (const row of (data ?? []) as unknown as TemplateRow[]) {
    if (!latest.has(row.famiglia_id)) latest.set(row.famiglia_id, toVersion(row));
  }
  return [...latest.values()]
    .filter((template) => !options.onlyActive || template.attivo)
    .sort((a, b) => a.nome.localeCompare(b.nome, "it"));
}

// All the versions of a template, newest first.
export async function listTemplateVersions(famigliaId: string): Promise<TemplateVersion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("famiglia_id", famigliaId)
    .order("versione", { ascending: false });
  if (error) fail("email_templates", error);
  return ((data ?? []) as unknown as TemplateRow[]).map(toVersion);
}

export async function getTemplateVersion(id: string): Promise<TemplateVersion | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("email_templates").select(TEMPLATE_COLUMNS).eq("id", id).maybeSingle();
  if (error) fail("email_templates", error);
  return data ? toVersion(data as unknown as TemplateRow) : null;
}

// ---------------------------------------------------------------------------
// Settings and signature
// ---------------------------------------------------------------------------

export type EmailSettings = { ragioneSociale: string | null; emailOpposizione: string | null; emailAFreddo: boolean };

export async function getEmailSettings(): Promise<EmailSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("chiave, valore")
    .in("chiave", ["ragione_sociale", "email_opposizione", "email_a_freddo"]);
  if (error) fail("app_settings", error);
  const read = (key: string) => data.find((row) => row.chiave === key)?.valore;
  const text = (key: string) => {
    const value = read(key);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  return { ragioneSociale: text("ragione_sociale"), emailOpposizione: text("email_opposizione"), emailAFreddo: read("email_a_freddo") === true };
}

export async function getSignature(userId: string): Promise<Signature> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("users")
    .select("firma_nome, firma_ruolo, firma_telefono, firma_testo")
    .eq("id", userId)
    .maybeSingle();
  if (error) fail("users", error);
  return { nome: data?.firma_nome ?? null, ruolo: data?.firma_ruolo ?? null, telefono: data?.firma_telefono ?? null, testo: data?.firma_testo ?? null };
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export type EmailPermission = {
  id: string;
  // Null: the party's own address.
  contactId: string | null;
  base: PermissionBasis;
  data: string;
  fonte: string | null;
  operatore: string | null;
};

// Active email permissions of a party and of its contacts, newest first.
export async function listPartyPermissions(partyId: string, contactIds: string[]): Promise<EmailPermission[]> {
  const supabase = await createClient();
  const filter = contactIds.length > 0 ? `party_id.eq.${partyId},contact_id.in.(${contactIds.join(",")})` : `party_id.eq.${partyId}`;
  const { data, error } = await supabase
    .from("contact_permissions")
    .select("id, contact_id, base, data, fonte, operatore:users!contact_permissions_created_by_fkey(nome, email)")
    .eq("canale", "email")
    .eq("stato", "attivo")
    .or(filter)
    .order("data", { ascending: false });
  if (error) fail("contact_permissions", error);
  return ((data ?? []) as unknown as { id: string; contact_id: string | null; base: PermissionBasis; data: string; fonte: string | null; operatore: UserRef }[]).map(
    (row) => ({ id: row.id, contactId: row.contact_id, base: row.base, data: row.data, fonte: row.fonte, operatore: userName(row.operatore) }),
  );
}

// ---------------------------------------------------------------------------
// Eligibility and "Prepara email"
// ---------------------------------------------------------------------------

export type EligibilityCheck = { codice: string; ok: boolean; testo: string };
export type Eligibility = {
  ammessa: boolean;
  destinatario: string | null;
  emailAFreddo: boolean;
  permesso: { base: PermissionBasis; data: string; fonte: string | null; operatore: string | null } | null;
  controlli: EligibilityCheck[];
};

export async function getEligibility(partyId: string, contactId: string | null): Promise<Eligibility> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("email_eligibility", { p_party: partyId, p_contact: contactId ?? undefined });
  if (error) fail("email_eligibility", error);
  const raw = data as {
    ammessa: boolean;
    destinatario: string | null;
    email_a_freddo: boolean;
    permesso: Eligibility["permesso"];
    controlli: EligibilityCheck[];
  };
  return { ammessa: raw.ammessa, destinatario: raw.destinatario, emailAFreddo: raw.email_a_freddo, permesso: raw.permesso, controlli: raw.controlli };
}

export type Recipient = { id: string | null; nome: string; email: string | null; nonContattare: boolean };

// Who can be written to: the contacts of the party and its general address.
export async function listRecipients(partyId: string): Promise<{ party: { id: string; nome: string; email: string | null; nonContattare: boolean; erased: boolean } | null; recipients: Recipient[] }> {
  const supabase = await createClient();
  const [{ data: party, error: partyError }, { data: contacts, error: contactsError }] = await Promise.all([
    supabase.from("parties").select("id, tipo, denominazione, nome, cognome, email, non_contattare, gdpr_cancellato_il, merged_into_id").eq("id", partyId).maybeSingle(),
    supabase.from("contacts").select("id, nome, cognome, ruolo, email, non_contattare").eq("party_id", partyId).order("created_at"),
  ]);
  if (partyError) fail("parties", partyError);
  if (contactsError) fail("contacts", contactsError);
  if (!party || party.merged_into_id) return { party: null, recipients: [] };
  const name = partyName(party);
  return {
    party: { id: party.id, nome: name, email: party.email, nonContattare: party.non_contattare, erased: party.gdpr_cancellato_il !== null },
    recipients: [
      ...(contacts ?? []).map((contact) => ({
        id: contact.id,
        nome: [contact.nome, contact.cognome].filter(Boolean).join(" ") || contact.ruolo || "Contatto",
        email: contact.email,
        nonContattare: contact.non_contattare,
      })),
      { id: null, nome: `${name} (indirizzo generale)`, email: party.email, nonContattare: party.non_contattare },
    ],
  };
}

export type EmailOpportunity = { id: string; parkingId: string; parking: string; aperta: boolean };

export async function listEmailOpportunities(partyId: string): Promise<EmailOpportunity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .select("id, esito, parking_id, parking:parking_facilities!opportunities_parking_id_fkey(nome, nome_breve)")
    .eq("party_id", partyId)
    .order("created_at", { ascending: false });
  if (error) fail("opportunities", error);
  return ((data ?? []) as unknown as { id: string; esito: string; parking_id: string; parking: { nome: string; nome_breve: string | null } | null }[]).map(
    (row) => ({ id: row.id, parkingId: row.parking_id, parking: row.parking ? (row.parking.nome_breve ?? row.parking.nome) : "–", aperta: row.esito === "aperta" }),
  );
}

// Values of the template variables for a party, a contact, a car park and
// the writer's signature.
export async function templateValues(input: {
  partyName: string;
  contactName: string | null;
  parkingId: string | null;
  signature: Signature;
}): Promise<TemplateValues> {
  let parcheggio: string | null = null;
  let indirizzo: string | null = null;
  let prodotti: string | null = null;
  if (input.parkingId) {
    const supabase = await createClient();
    const [{ data: parking, error: parkingError }, { data: products, error: productsError }] = await Promise.all([
      supabase.from("parking_facilities").select("nome, indirizzo, cap, citta").eq("id", input.parkingId).maybeSingle(),
      supabase
        .from("parking_products")
        .select("nome, giorni, ora_da, ora_a, periodo, prezzo_netto")
        .eq("parking_id", input.parkingId)
        .eq("attivo", true)
        .order("nome"),
    ]);
    if (parkingError) fail("parking_facilities", parkingError);
    if (productsError) fail("parking_products", productsError);
    if (parking) {
      parcheggio = parking.nome;
      indirizzo = facilityAddress(parking) || null;
    }
    prodotti =
      formatProducts(
        (products ?? []).map((product) => ({
          nome: product.nome,
          giorni: product.giorni,
          oraDa: product.ora_da,
          oraA: product.ora_a,
          periodo: product.periodo,
          prezzoNetto: product.prezzo_netto === null ? null : Number(product.prezzo_netto),
        })),
      ) || null;
  }
  return {
    azienda: input.partyName,
    referente: input.contactName,
    parcheggio,
    indirizzo_parcheggio: indirizzo,
    prodotti_prezzi: prodotti,
    firma: formatSignature(input.signature) || null,
  };
}

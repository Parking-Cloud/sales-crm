"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { romeInstant } from "@/lib/pipeline/dates";
import type { PermissionBasis } from "@/lib/email/template";
import { createClient } from "@/lib/supabase/server";

// Email permissions (B4) and "Segna come inviata" (B5). The database checks
// everything again: basis, address, suppression list, eligibility.

type Result<T = null> = { ok: true; data: T } | { ok: false; message: string };

const NOT_ALLOWED = "Non hai i permessi per questa operazione.";
const UUID = /^[0-9a-f-]{36}$/i;
const BASES: PermissionBasis[] = ["richiesta_in_chiamata", "contatto_in_entrata", "consenso"];

function refresh(partyId: string, opportunityId?: string | null) {
  revalidatePath(`/soggetti/${partyId}`);
  if (opportunityId) revalidatePath(`/opportunita/${opportunityId}`);
  revalidatePath("/email/prepara");
}

function permissionMessage(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return error.message?.includes("do not contact") ? "Contatto da non contattare o in lista di esclusione: nessun permesso." : NOT_ALLOWED;
  if (error.code === "23514") {
    if (error.message?.includes("email address")) return "Serve l'indirizzo email.";
    if (error.message?.includes("future")) return "La data non può essere nel futuro.";
    if (error.message?.includes("email")) return "Indirizzo email non valido.";
    return "Scegli la base del permesso.";
  }
  return "Salvataggio non riuscito. Riprova.";
}

export async function registerPermission(input: {
  partyId: string;
  contactId: string | null;
  base: string;
  fonte: string;
  giorno: string;
  email: string;
}): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (!UUID.test(input?.partyId ?? "") || (input.contactId !== null && !UUID.test(input.contactId))) return { ok: false, message: "Contatto non trovato." };
  if (!BASES.includes(input.base as PermissionBasis)) return { ok: false, message: "Scegli la base del permesso." };
  if (input.giorno && !/^\d{4}-\d{2}-\d{2}$/.test(input.giorno)) return { ok: false, message: "Data non valida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("register_email_permission", {
    // One of the two: the contact, or the party's own address.
    p_contact: input.contactId as string,
    p_party: (input.contactId ? null : input.partyId) as string,
    p_base: input.base as PermissionBasis,
    p_fonte: input.fonte?.trim().slice(0, 200) || undefined,
    p_data: input.giorno ? romeInstant(input.giorno, "12:00").toISOString() : undefined,
    p_email: input.email?.trim().slice(0, 254) || undefined,
  });
  if (error) return { ok: false, message: permissionMessage(error) };
  refresh(input.partyId);
  return { ok: true, data: null };
}

// Recipients offered by the call dialog for "Ha chiesto di ricevere l'email":
// the contacts of the party and its general address.
export type CallRecipient = { id: string | null; nome: string; email: string | null; disponibile: boolean };

export async function listCallRecipients(input: { partyId: string | null; opportunityId: string | null }): Promise<Result<{ partyId: string; contactId: string | null; recipients: CallRecipient[] }>> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  const supabase = await createClient();
  let partyId = input?.partyId && UUID.test(input.partyId) ? input.partyId : null;
  let contactId: string | null = null;
  if (input?.opportunityId && UUID.test(input.opportunityId)) {
    const { data } = await supabase.from("opportunities").select("party_id, contact_id").eq("id", input.opportunityId).maybeSingle();
    partyId = data?.party_id ?? partyId;
    contactId = data?.contact_id ?? null;
  }
  if (!partyId) return { ok: false, message: "Soggetto non trovato." };
  const [{ data: party }, { data: contacts }] = await Promise.all([
    supabase.from("parties").select("denominazione, nome, cognome, email, non_contattare").eq("id", partyId).maybeSingle(),
    supabase.from("contacts").select("id, nome, cognome, ruolo, email, non_contattare").eq("party_id", partyId).order("created_at"),
  ]);
  if (!party) return { ok: false, message: "Soggetto non trovato." };
  const partyLabel = party.denominazione ?? ([party.nome, party.cognome].filter(Boolean).join(" ") || "Soggetto");
  return {
    ok: true,
    data: {
      partyId,
      contactId,
      recipients: [
        ...(contacts ?? []).map((contact) => ({
          id: contact.id,
          nome: [contact.nome, contact.cognome].filter(Boolean).join(" ") || contact.ruolo || "Contatto",
          email: contact.email,
          disponibile: !contact.non_contattare && !party.non_contattare,
        })),
        { id: null, nome: `${partyLabel} (indirizzo generale)`, email: party.email, disponibile: !party.non_contattare },
      ],
    },
  };
}

export async function recordSentEmail(input: {
  partyId: string;
  contactId: string | null;
  opportunityId: string | null;
  templateId: string | null;
  oggetto: string;
  corpo: string;
}): Promise<Result<{ communicationId: string }>> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  const id = (value: string | null) => (value && UUID.test(value) ? value : null);
  if (!id(input?.partyId)) return { ok: false, message: "Soggetto non trovato." };
  if (!input.oggetto?.trim() || !input.corpo?.trim()) return { ok: false, message: "Oggetto e testo sono obbligatori." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_sent_email", {
    p_party: input.partyId,
    // Null: the party's own address; no opportunity or template.
    p_contact: id(input.contactId) as string,
    p_opportunity: id(input.opportunityId) as string,
    p_template: id(input.templateId) as string,
    p_oggetto: input.oggetto.trim().slice(0, 300),
    p_corpo: input.corpo.slice(0, 30000),
  });
  if (error) {
    if (error.code === "42501" && error.message?.startsWith("email not allowed")) {
      return { ok: false, message: "L'email non è più ammessa: ricarica la pagina per vedere il motivo." };
    }
    return { ok: false, message: error.code === "42501" ? NOT_ALLOWED : "Registrazione non riuscita. Riprova." };
  }
  refresh(input.partyId, input.opportunityId);
  revalidatePath("/pipeline");
  return { ok: true, data: { communicationId: data as string } };
}

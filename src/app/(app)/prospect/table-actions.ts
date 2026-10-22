"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { emailError, phoneError } from "@/lib/parties/validation";
import { isPartyCategory } from "@/lib/parties/labels";
import { isOfferStatus, isProspectStatus, isReasonChoice } from "@/lib/prospect/labels";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

// Cells edited in place in Prospect, Pipeline and Promemoria (block 1a-9).
// Every active user can change them; the audit triggers record each change
// with its author. Telephone, email and contact person are written on the
// prospect's main contact (created when missing).

type LossReason = Database["public"]["Enums"]["loss_reason"];
type Result<T = null> = { ok: true; data: T } | { ok: false; message: string };

const UUID = /^[0-9a-f-]{36}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const NOT_ALLOWED = "Non hai i permessi per questa operazione.";
const SAVE_FAILED = "Salvataggio non riuscito. Riprova.";
const NOT_FOUND = "Riga non trovata: aggiorna la pagina.";

function refresh(partyId?: string) {
  revalidatePath("/prospect");
  revalidatePath("/pipeline");
  revalidatePath("/promemoria");
  if (partyId) revalidatePath(`/prospect/${partyId}`);
}

async function guard(...ids: string[]): Promise<string | null> {
  if (!(await getCurrentUser())) return NOT_ALLOWED;
  if (ids.some((id) => typeof id !== "string" || !UUID.test(id))) return NOT_FOUND;
  return null;
}

function validDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d && y >= 2000 && y <= 2100;
}

// ---------------------------------------------------------------------------
// Prospect
// ---------------------------------------------------------------------------

export type StatusChange = { entrate: number; uscite: number; chiuse: number };

export async function setProspectStatus(partyId: string, stato: string, motivo: string): Promise<Result<StatusChange>> {
  const denied = await guard(partyId);
  if (denied) return { ok: false, message: denied };
  if (!isProspectStatus(stato)) return { ok: false, message: "Stato non valido." };
  if (motivo && !isReasonChoice(motivo)) return { ok: false, message: "Motivo non valido." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_prospect_status", {
    p_party: partyId,
    p_stato: stato,
    p_motivo: stato === "non_interessato" && motivo ? (motivo as LossReason) : undefined,
  });
  if (error) {
    if (error.code === "P0002") return { ok: false, message: NOT_FOUND };
    if (error.code === "22023") return { ok: false, message: "Prospect cancellato per GDPR: lo stato non si cambia." };
    if (error.code === "23505") return { ok: false, message: "Su uno dei parcheggi c'è già un'opportunità aperta: controlla la scheda del prospect." };
    return { ok: false, message: SAVE_FAILED };
  }
  refresh(partyId);
  return { ok: true, data: data as StatusChange };
}

export type ProspectField = "categoria" | "ultimo_contatto_il";

export async function updateProspectField(partyId: string, field: ProspectField, value: string): Promise<Result> {
  const denied = await guard(partyId);
  if (denied) return { ok: false, message: denied };
  const text = typeof value === "string" ? value.trim() : "";
  let patch: { categoria?: string | null; ultimo_contatto_il?: string | null };
  if (field === "categoria") {
    if (text && !isPartyCategory(text)) return { ok: false, message: "Categoria non valida." };
    patch = { categoria: text || null };
  } else if (field === "ultimo_contatto_il") {
    if (text && !validDay(text)) return { ok: false, message: "Data non valida." };
    patch = { ultimo_contatto_il: text || null };
  } else {
    return { ok: false, message: SAVE_FAILED };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("parties").update(patch).eq("id", partyId).is("merged_into_id", null).select("id");
  if (error) return { ok: false, message: SAVE_FAILED };
  if (!data || data.length === 0) return { ok: false, message: NOT_FOUND };
  refresh(partyId);
  return { ok: true, data: null };
}

export async function saveProspectNote(partyId: string, note: string): Promise<Result> {
  const denied = await guard(partyId);
  if (denied) return { ok: false, message: denied };
  const text = typeof note === "string" ? note : "";
  if (text.length > 5000) return { ok: false, message: "Le note possono avere al massimo 5.000 caratteri." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_notes", { p_entita: "parties", p_id: partyId, p_note: text });
  if (error) return { ok: false, message: error.code === "P0002" ? NOT_FOUND : SAVE_FAILED };
  refresh(partyId);
  return { ok: true, data: null };
}

export type ContactField = "telefono" | "email" | "referente";

// Telephone, email or contact person of the main contact.
export async function savePrimaryContact(partyId: string, field: ContactField, value: string): Promise<Result> {
  const denied = await guard(partyId);
  if (denied) return { ok: false, message: denied };
  if (field !== "telefono" && field !== "email" && field !== "referente") return { ok: false, message: SAVE_FAILED };
  const text = typeof value === "string" ? value.trim().slice(0, 200) : "";
  if (text && field === "email") {
    const problem = emailError(text);
    if (problem) return { ok: false, message: problem };
  }
  if (text && field === "telefono") {
    const problem = phoneError(text);
    if (problem) return { ok: false, message: problem };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_primary_contact", { p_party: partyId, p_campo: field, p_valore: text });
  if (error) {
    if (error.code === "P0002") return { ok: false, message: NOT_FOUND };
    if (error.code === "23514") return { ok: false, message: field === "email" ? "Indirizzo email non valido." : "Numero di telefono non valido." };
    return { ok: false, message: SAVE_FAILED };
  }
  refresh(partyId);
  return { ok: true, data: null };
}

// "Togli parcheggio": refused when an offer was sent or an email recorded.
export async function removeParking(partyId: string, parkingId: string): Promise<Result> {
  const denied = await guard(partyId, parkingId);
  if (denied) return { ok: false, message: denied };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_parking_from_prospect", { p_party: partyId, p_parking: parkingId });
  if (error) {
    if (error.code === "23514") return { ok: false, message: "Su questo parcheggio c'è un'offerta già inviata: resta nello storico." };
    if (error.code === "23503") return { ok: false, message: "Su questo parcheggio ci sono email registrate: resta nello storico." };
    if (error.code === "P0002") return { ok: false, message: NOT_FOUND };
    return { ok: false, message: SAVE_FAILED };
  }
  refresh(partyId);
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Pipeline and Promemoria
// ---------------------------------------------------------------------------

export async function setOfferStatus(opportunityId: string, stato: string, motivo: string): Promise<Result> {
  const denied = await guard(opportunityId);
  if (denied) return { ok: false, message: denied };
  if (!isOfferStatus(stato)) return { ok: false, message: "Stato dell'offerta non valido." };
  if (motivo && !isReasonChoice(motivo)) return { ok: false, message: "Motivo non valido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_offer_status", {
    p_opportunity: opportunityId,
    p_stato: stato,
    p_motivo: stato === "rifiutata" && motivo ? (motivo as LossReason) : undefined,
  });
  if (error) {
    if (error.code === "P0002") return { ok: false, message: NOT_FOUND };
    if (error.code === "23505") return { ok: false, message: "Il prospect ha già un'altra opportunità aperta su questo parcheggio: controlla la sua scheda." };
    return { ok: false, message: SAVE_FAILED };
  }
  refresh();
  return { ok: true, data: null };
}

export type PipelineField = "responsabile_id" | "note" | "promemoria_il";

export async function updatePipelineField(opportunityId: string, field: PipelineField, value: string): Promise<Result> {
  const denied = await guard(opportunityId);
  if (denied) return { ok: false, message: denied };
  const text = typeof value === "string" ? value.trim() : "";
  let patch: { responsabile_id?: string | null; note?: string | null; promemoria_il?: string | null };
  if (field === "responsabile_id") {
    if (text && !UUID.test(text)) return { ok: false, message: "Responsabile non valido." };
    patch = { responsabile_id: text || null };
  } else if (field === "note") {
    if (text.length > 2000) return { ok: false, message: "La nota può avere al massimo 2.000 caratteri." };
    patch = { note: text || null };
  } else if (field === "promemoria_il") {
    if (text && !validDay(text)) return { ok: false, message: "Data non valida." };
    patch = { promemoria_il: text || null };
  } else {
    return { ok: false, message: SAVE_FAILED };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("opportunities").update(patch).eq("id", opportunityId).not("stato_offerta", "is", null).select("id");
  if (error) return { ok: false, message: error.code === "23503" ? "Responsabile non trovato." : SAVE_FAILED };
  if (!data || data.length === 0) return { ok: false, message: NOT_FOUND };
  refresh();
  return { ok: true, data: null };
}

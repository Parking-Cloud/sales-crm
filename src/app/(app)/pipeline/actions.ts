"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ENTRY_STAGES, ORIGINS, type EntryStage, type Origin } from "@/lib/pipeline/entry";
import { createClient } from "@/lib/supabase/server";

// Opportunities: a prospect added to car parks, and the fields of the
// opportunity page. Every active user changes the opportunities of everyone
// (small team); deletions are for administrators (RLS). Statuses, reminders
// and notes of the pipeline are in prospect/table-actions.ts (block 1a-9).

type Result<T = null> = { ok: true; data: T } | { ok: false; message: string };

const UUID = /^[0-9a-f-]{36}$/i;
const NOT_ALLOWED = "Non hai i permessi per questa operazione.";
const SAVE_FAILED = "Salvataggio non riuscito. Riprova.";

function refresh(opportunityId?: string | null, partyId?: string | null) {
  revalidatePath("/pipeline");
  revalidatePath("/promemoria");
  if (opportunityId) revalidatePath(`/opportunita/${opportunityId}`);
  if (partyId) revalidatePath(`/prospect/${partyId}`);
}

function dbMessage(error: { code?: string; message?: string }): string {
  if (error.code === "42501") return NOT_ALLOWED;
  if (error.code === "23505") return "Il prospect ha già un'opportunità aperta su questo parcheggio: non se ne possono avere due.";
  return SAVE_FAILED;
}

// ---------------------------------------------------------------------------
// Entry: parties added to a car park (block 1a-7, part A)
// ---------------------------------------------------------------------------

export type AddToParkingRow = { partyId: string; esito: "creata" | "saltata"; opportunityId: string | null; motivo: string | null };

const MAX_PARTIES = 200;

export async function addToParking(input: {
  partyIds: string[];
  parkingId: string;
  fase?: EntryStage;
  origine?: Origin | null;
}): Promise<Result<AddToParkingRow[]>> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  const partyIds = [...new Set((input?.partyIds ?? []).filter((id) => typeof id === "string" && UUID.test(id)))];
  if (partyIds.length === 0) return { ok: false, message: "Scegli almeno un prospect." };
  if (partyIds.length > MAX_PARTIES) return { ok: false, message: `Al massimo ${MAX_PARTIES} prospect alla volta.` };
  if (!UUID.test(input.parkingId ?? "")) return { ok: false, message: "Scegli un parcheggio." };
  const fase = input.fase && (ENTRY_STAGES as readonly string[]).includes(input.fase) ? input.fase : "individuata";
  const origine = input.origine && (ORIGINS as readonly string[]).includes(input.origine) ? input.origine : undefined;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_to_parking", { p_parties: partyIds, p_parking: input.parkingId, p_fase: fase, p_origine: origine });
  if (error) return { ok: false, message: error.code === "P0002" ? "Parcheggio non trovato o archiviato." : dbMessage(error) };
  const rows = (data ?? []).map((row) => ({
    partyId: row.party_id,
    esito: row.esito === "creata" ? ("creata" as const) : ("saltata" as const),
    opportunityId: row.opportunity_id,
    motivo: row.motivo,
  }));
  revalidatePath("/pipeline");
  revalidatePath("/prospect");
  partyIds.forEach((id) => revalidatePath(`/prospect/${id}`));
  return { ok: true, data: rows };
}

// ---------------------------------------------------------------------------
// Opportunity fields (B6)
// ---------------------------------------------------------------------------

export async function updateOpportunity(input: {
  opportunityId: string;
  responsabileId: string;
  contactId: string;
  prodottoId: string;
  postiRichiesti: string;
  valoreMensile: string;
}): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (!UUID.test(input?.opportunityId ?? "")) return { ok: false, message: "Opportunità non trovata." };
  const id = (value: string) => (value && UUID.test(value) ? value : null);
  const posti = input.postiRichiesti.trim() === "" ? null : Number(input.postiRichiesti);
  if (posti !== null && (!Number.isInteger(posti) || posti < 0 || posti > 100000)) return { ok: false, message: "Posti richiesti: un numero intero." };
  const rawValue = input.valoreMensile.replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  const valore = rawValue === "" ? null : Number(rawValue);
  if (valore !== null && (!Number.isFinite(valore) || valore < 0 || valore > 10_000_000)) {
    return { ok: false, message: "Valore mensile: un numero, per esempio 450 o 1.200,50." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunities")
    .update({
      responsabile_id: id(input.responsabileId),
      contact_id: id(input.contactId),
      prodotto_interesse_id: id(input.prodottoId),
      posti_richiesti: posti,
      valore_mensile_stimato: valore,
    })
    .eq("id", input.opportunityId)
    .select("party_id");
  if (error) return { ok: false, message: dbMessage(error) };
  if (!data || data.length === 0) return { ok: false, message: "Opportunità non trovata." };
  refresh(input.opportunityId, data[0].party_id);
  return { ok: true, data: null };
}

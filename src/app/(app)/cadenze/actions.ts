"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { STEP_TYPES, type StepType } from "@/lib/cadences/schedule";
import { createClient } from "@/lib/supabase/server";

// Light cadences (block 1a-8): editor, enrollment, pause, resume, stop,
// skip. Every active user; the database checks the rules again (used steps
// locked, one active enrollment per opportunity, exclusions).

type Result<T = null> = { ok: true; data: T } | { ok: false; message: string };

const NOT_ALLOWED = "Non hai i permessi per questa operazione.";
const FAILED = "Operazione non riuscita. Riprova.";
const UUID = /^[0-9a-f-]{36}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

function refreshCadence(id?: string) {
  revalidatePath("/cadenze");
  if (id) revalidatePath(`/cadenze/${id}`);
}

function refreshWork() {
  revalidatePath("/promemoria");
  revalidatePath("/pipeline");
  revalidatePath("/prospect");
}

function stepMessage(error: { code?: string; message?: string }): string {
  if (error.message?.includes("already used")) return "Questo passo è già stato usato da almeno un iscritto: non si modifica.";
  if (error.message?.includes("come first")) return "I passi già usati restano in testa: questo passo non può andare prima.";
  if (error.code === "23514") return "Un passo email ha bisogno del template.";
  if (error.code === "23503") return "Template non trovato.";
  return error.code === "42501" ? NOT_ALLOWED : FAILED;
}

// ---------------------------------------------------------------------------
// Cadences
// ---------------------------------------------------------------------------

export type CadenceFormState = { version: number; status: "idle" | "error" | "saved"; message?: string };

export async function createCadence(previous: CadenceFormState, form: FormData): Promise<CadenceFormState> {
  const version = previous.version + 1;
  if (!(await getCurrentUser())) return { version, status: "error", message: NOT_ALLOWED };
  const nome = String(form.get("nome") ?? "").trim();
  if (!nome || nome.length > 120) return { version, status: "error", message: "Scrivi il nome (al massimo 120 caratteri)." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("cadences").insert({ nome }).select("id").single();
  if (error) return { version, status: "error", message: error.code === "42501" ? NOT_ALLOWED : FAILED };
  refreshCadence();
  redirect(`/cadenze/${data.id}`);
}

export async function updateCadence(input: { id: string; nome: string; descrizione: string }): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  const nome = input?.nome?.trim() ?? "";
  if (!UUID.test(input?.id ?? "")) return { ok: false, message: "Cadenza non trovata." };
  if (!nome || nome.length > 120) return { ok: false, message: "Scrivi il nome (al massimo 120 caratteri)." };
  const descrizione = input.descrizione?.trim().slice(0, 1000) || null;
  const supabase = await createClient();
  const { error } = await supabase.from("cadences").update({ nome, descrizione }).eq("id", input.id);
  if (error) return { ok: false, message: error.code === "42501" ? NOT_ALLOWED : FAILED };
  refreshCadence(input.id);
  return { ok: true, data: null };
}

export async function setCadenceArchived(id: string, archived: boolean): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (!UUID.test(id ?? "")) return { ok: false, message: "Cadenza non trovata." };
  const supabase = await createClient();
  const { error } = await supabase.from("cadences").update({ archiviata_il: archived ? new Date().toISOString() : null }).eq("id", id);
  if (error) return { ok: false, message: error.code === "42501" ? NOT_ALLOWED : FAILED };
  refreshCadence(id);
  return { ok: true, data: null };
}

export async function duplicateCadence(id: string): Promise<Result<{ id: string }>> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (!UUID.test(id ?? "")) return { ok: false, message: "Cadenza non trovata." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_cadence", { p_cadence: id });
  if (error) return { ok: false, message: error.code === "42501" ? NOT_ALLOWED : FAILED };
  refreshCadence();
  return { ok: true, data: { id: data as string } };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export type StepInput = {
  cadenceId: string;
  // Missing: a new step at the end.
  stepId?: string;
  tipo: string;
  attesaGiorni: number;
  orario: string;
  templateFamigliaId: string;
  istruzioni: string;
};

export async function saveStep(input: StepInput): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (!UUID.test(input?.cadenceId ?? "")) return { ok: false, message: "Cadenza non trovata." };
  if (!(STEP_TYPES as readonly string[]).includes(input.tipo)) return { ok: false, message: "Scegli il tipo di passo." };
  const attesa = Number(input.attesaGiorni);
  if (!Number.isInteger(attesa) || attesa < 0 || attesa > 60) return { ok: false, message: "L'attesa va da 0 a 60 giorni lavorativi." };
  if (input.orario && !TIME.test(input.orario)) return { ok: false, message: "Orario non valido." };
  if (input.tipo === "email" && !UUID.test(input.templateFamigliaId ?? "")) return { ok: false, message: "Un passo email ha bisogno del template." };
  const values = {
    tipo: input.tipo as StepType,
    attesa_giorni: attesa,
    orario: input.orario || null,
    template_famiglia_id: input.tipo === "email" ? input.templateFamigliaId : null,
    istruzioni: input.istruzioni?.trim().slice(0, 1000) || null,
  };
  const supabase = await createClient();
  if (input.stepId) {
    if (!UUID.test(input.stepId)) return { ok: false, message: "Passo non trovato." };
    const { error } = await supabase.from("cadence_steps").update(values).eq("id", input.stepId);
    if (error) return { ok: false, message: stepMessage(error) };
  } else {
    const { data: last } = await supabase
      .from("cadence_steps")
      .select("posizione")
      .eq("cadence_id", input.cadenceId)
      .order("posizione", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase.from("cadence_steps").insert({ ...values, cadence_id: input.cadenceId, posizione: (last?.posizione ?? 0) + 1 });
    if (error) return { ok: false, message: stepMessage(error) };
  }
  refreshCadence(input.cadenceId);
  return { ok: true, data: null };
}

export async function moveStep(cadenceId: string, stepId: string, direction: -1 | 1): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (!UUID.test(stepId ?? "")) return { ok: false, message: "Passo non trovato." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_cadence_step", { p_step: stepId, p_direction: direction === -1 ? -1 : 1 });
  if (error) return { ok: false, message: stepMessage(error) };
  refreshCadence(cadenceId);
  return { ok: true, data: null };
}

export async function deleteStep(cadenceId: string, stepId: string): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (!UUID.test(stepId ?? "")) return { ok: false, message: "Passo non trovato." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_cadence_step", { p_step: stepId });
  if (error) return { ok: false, message: stepMessage(error) };
  refreshCadence(cadenceId);
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Enrollment (B3)
// ---------------------------------------------------------------------------

export type EnrollRow = { partyId: string | null; opportunityId: string | null; esito: "iscritta" | "saltata"; motivo: string | null };

function enrollMessage(error: { code?: string; message?: string }): string {
  if (error.code === "P0002") return "Cadenza non trovata o archiviata.";
  if (error.message?.includes("no steps")) return "La cadenza non ha passi.";
  return error.code === "42501" ? NOT_ALLOWED : FAILED;
}

export async function enrollInCadence(input: {
  cadenceId: string;
  avvio: string;
  // From the party list: parties, and the car park when they have several.
  partyIds?: string[];
  parkingId?: string | null;
  // From the pipeline or the opportunity page.
  opportunityIds?: string[];
}): Promise<Result<EnrollRow[]>> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (!UUID.test(input?.cadenceId ?? "")) return { ok: false, message: "Scegli la cadenza." };
  if (!DAY.test(input.avvio ?? "")) return { ok: false, message: "Scegli la data di avvio." };
  const supabase = await createClient();
  if (input.partyIds && input.partyIds.length > 0) {
    const ids = [...new Set(input.partyIds.filter((id) => UUID.test(id)))].slice(0, 200);
    const parking = input.parkingId && UUID.test(input.parkingId) ? input.parkingId : null;
    const { data, error } = await supabase.rpc("enroll_parties_in_cadence", {
      p_cadence: input.cadenceId,
      p_parties: ids,
      // Null: every open opportunity of the party (skipped when several).
      p_parking: parking as string,
      p_avvio: input.avvio,
    });
    if (error) return { ok: false, message: enrollMessage(error) };
    refreshWork();
    refreshCadence(input.cadenceId);
    return {
      ok: true,
      data: (data ?? []).map((row) => ({ partyId: row.party_id, opportunityId: row.opportunity_id, esito: row.esito === "iscritta" ? "iscritta" : "saltata", motivo: row.motivo })),
    };
  }
  const opportunities = [...new Set((input.opportunityIds ?? []).filter((id) => UUID.test(id)))].slice(0, 200);
  if (opportunities.length === 0) return { ok: false, message: "Seleziona almeno un soggetto o un'opportunità." };
  const { data, error } = await supabase.rpc("enroll_in_cadence", {
    p_cadence: input.cadenceId,
    p_items: opportunities.map((id) => ({ opportunity_id: id })),
    p_avvio: input.avvio,
  });
  if (error) return { ok: false, message: enrollMessage(error) };
  refreshWork();
  refreshCadence(input.cadenceId);
  opportunities.forEach((id) => revalidatePath(`/opportunita/${id}`));
  return {
    ok: true,
    data: (data ?? []).map((row) => ({ partyId: null, opportunityId: row.opportunity_id, esito: row.esito === "iscritta" ? "iscritta" : "saltata", motivo: row.motivo })),
  };
}

// ---------------------------------------------------------------------------
// Pause, resume, stop, skip (B4, B6)
// ---------------------------------------------------------------------------

async function enrollmentCall(name: "pause_cadence" | "resume_cadence", id: string): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (!UUID.test(id ?? "")) return { ok: false, message: "Iscrizione non trovata." };
  const supabase = await createClient();
  const { error } = await supabase.rpc(name, { p_enrollment: id });
  if (error) return { ok: false, message: error.code === "P0002" ? "La cadenza è già cambiata: ricarica la pagina." : FAILED };
  refreshWork();
  revalidatePath("/opportunita/[id]", "page");
  return { ok: true, data: null };
}

export async function pauseCadence(enrollmentId: string): Promise<Result> {
  return enrollmentCall("pause_cadence", enrollmentId);
}

export async function resumeCadence(enrollmentId: string): Promise<Result> {
  return enrollmentCall("resume_cadence", enrollmentId);
}

export async function stopCadence(enrollmentId: string, esito: "risposto" | "manuale", motivo: string): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (!UUID.test(enrollmentId ?? "")) return { ok: false, message: "Iscrizione non trovata." };
  if (!motivo?.trim()) return { ok: false, message: "Scrivi il motivo." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("stop_cadence", {
    p_enrollment: enrollmentId,
    p_esito: esito === "risposto" ? "risposto" : "manuale",
    p_motivo: motivo.trim().slice(0, 500),
  });
  if (error) return { ok: false, message: error.code === "P0002" ? "La cadenza è già ferma: ricarica la pagina." : FAILED };
  refreshWork();
  revalidatePath("/opportunita/[id]", "page");
  return { ok: true, data: null };
}

export async function skipStep(taskId: string, motivo: string): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (!UUID.test(taskId ?? "")) return { ok: false, message: "Passo non trovato." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("skip_cadence_step", { p_task: taskId, p_motivo: motivo?.trim().slice(0, 500) || undefined });
  if (error) return { ok: false, message: error.code === "P0002" ? "Passo già fatto o non trovato: ricarica la pagina." : FAILED };
  refreshWork();
  revalidatePath("/opportunita/[id]", "page");
  return { ok: true, data: null };
}

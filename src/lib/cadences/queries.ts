import { createClient } from "@/lib/supabase/server";
import { cadenceStats, type CadenceStats, type EnrollmentState, type StepType, type StopOutcome } from "./schedule";

// Reads for cadences (block 1a-8, RLS applies).

function fail(table: string, error: { code?: string; message: string }): never {
  throw new Error(`${table}: ${error.code ?? error.message}`);
}

type UserRef = { nome: string | null; email: string } | null;
const userName = (user: UserRef) => (user ? user.nome?.trim() || user.email : null);

export type CadenceStep = {
  id: string;
  posizione: number;
  tipo: StepType;
  attesaGiorni: number;
  orario: string | null;
  templateFamigliaId: string | null;
  istruzioni: string | null;
  // Already used by an enrollment: read-only.
  usato: boolean;
};

export type Cadence = {
  id: string;
  nome: string;
  descrizione: string | null;
  archiviata: boolean;
  autore: string | null;
  creataIl: string;
  steps: CadenceStep[];
  stats: CadenceStats;
};

type StepRow = {
  id: string;
  cadence_id: string;
  posizione: number;
  tipo: StepType;
  attesa_giorni: number;
  orario: string | null;
  template_famiglia_id: string | null;
  istruzioni: string | null;
};

async function usedSteps(stepIds: string[]): Promise<Set<string>> {
  const used = new Set<string>();
  if (stepIds.length === 0) return used;
  const supabase = await createClient();
  const [{ data: tasks, error: tasksError }, { data: enrollments, error: enrollmentsError }] = await Promise.all([
    supabase.from("tasks").select("cadence_step_id").in("cadence_step_id", stepIds),
    supabase.from("cadence_enrollments").select("step_id").in("step_id", stepIds),
  ]);
  if (tasksError) fail("tasks", tasksError);
  if (enrollmentsError) fail("cadence_enrollments", enrollmentsError);
  for (const row of tasks ?? []) if (row.cadence_step_id) used.add(row.cadence_step_id);
  for (const row of enrollments ?? []) if (row.step_id) used.add(row.step_id);
  return used;
}

export async function listCadences(options: { withArchived?: boolean; ids?: string[] } = {}): Promise<Cadence[]> {
  const supabase = await createClient();
  let query = supabase
    .from("cadences")
    .select("id, nome, descrizione, archiviata_il, created_at, autore:users!cadences_created_by_fkey(nome, email)")
    .order("nome");
  if (!options.withArchived) query = query.is("archiviata_il", null);
  if (options.ids) query = query.in("id", options.ids);
  const { data, error } = await query;
  if (error) fail("cadences", error);
  const rows = (data ?? []) as unknown as { id: string; nome: string; descrizione: string | null; archiviata_il: string | null; created_at: string; autore: UserRef }[];
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return [];
  const [{ data: steps, error: stepsError }, { data: enrollments, error: enrollmentsError }] = await Promise.all([
    supabase.from("cadence_steps").select("id, cadence_id, posizione, tipo, attesa_giorni, orario, template_famiglia_id, istruzioni").in("cadence_id", ids).order("posizione"),
    supabase.from("cadence_enrollments").select("cadence_id, stato, esito").in("cadence_id", ids),
  ]);
  if (stepsError) fail("cadence_steps", stepsError);
  if (enrollmentsError) fail("cadence_enrollments", enrollmentsError);
  const used = await usedSteps((steps ?? []).map((step) => step.id));
  return rows.map((row) => ({
    id: row.id,
    nome: row.nome,
    descrizione: row.descrizione,
    archiviata: row.archiviata_il !== null,
    autore: userName(row.autore),
    creataIl: row.created_at,
    steps: ((steps ?? []) as StepRow[])
      .filter((step) => step.cadence_id === row.id)
      .map((step) => ({
        id: step.id,
        posizione: step.posizione,
        tipo: step.tipo,
        attesaGiorni: step.attesa_giorni,
        orario: step.orario ? step.orario.slice(0, 5) : null,
        templateFamigliaId: step.template_famiglia_id,
        istruzioni: step.istruzioni,
        usato: used.has(step.id),
      })),
    stats: cadenceStats(
      ((enrollments ?? []) as { cadence_id: string; stato: EnrollmentState; esito: StopOutcome | null }[]).filter((item) => item.cadence_id === row.id),
    ),
  }));
}

export async function getCadence(id: string): Promise<Cadence | null> {
  return (await listCadences({ withArchived: true, ids: [id] }))[0] ?? null;
}

// ---------------------------------------------------------------------------
// Enrollments
// ---------------------------------------------------------------------------

export type EnrollmentInfo = {
  id: string;
  cadenceId: string;
  cadenza: string;
  stato: EnrollmentState;
  passo: number | null;
  passi: number;
  contatto: string | null;
  // Open task of the current step, if any.
  prossimoIl: string | null;
  taskId: string | null;
  avvio: string;
};

type EnrollmentRow = {
  id: string;
  cadence_id: string;
  opportunity_id: string;
  stato: EnrollmentState;
  avvio: string;
  step: { posizione: number } | null;
  cadence: { nome: string } | null;
  contact: { nome: string | null; cognome: string | null } | null;
};

// Active or paused enrollment of each opportunity.
export async function activeEnrollments(opportunityIds: string[]): Promise<Map<string, EnrollmentInfo>> {
  const out = new Map<string, EnrollmentInfo>();
  if (opportunityIds.length === 0) return out;
  // Long lists in chunks (ids go in the query string).
  if (opportunityIds.length > 150) {
    const parts = await Promise.all(
      Array.from({ length: Math.ceil(opportunityIds.length / 150) }, (_, i) => activeEnrollments(opportunityIds.slice(i * 150, i * 150 + 150))),
    );
    parts.forEach((part) => part.forEach((value, key) => out.set(key, value)));
    return out;
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cadence_enrollments")
    .select(
      "id, cadence_id, opportunity_id, stato, avvio, step:cadence_steps!cadence_enrollments_step_id_fkey(posizione), " +
        "cadence:cadences!cadence_enrollments_cadence_id_fkey(nome), contact:contacts!cadence_enrollments_contact_id_fkey(nome, cognome)",
    )
    .in("opportunity_id", opportunityIds)
    .in("stato", ["attiva", "in_pausa"]);
  if (error) fail("cadence_enrollments", error);
  const rows = (data ?? []) as unknown as EnrollmentRow[];
  if (rows.length === 0) return out;
  const cadenceIds = [...new Set(rows.map((row) => row.cadence_id))];
  const [{ data: steps }, { data: tasks }] = await Promise.all([
    supabase.from("cadence_steps").select("cadence_id").in("cadence_id", cadenceIds),
    supabase.from("tasks").select("id, cadence_enrollment_id, scadenza").in("cadence_enrollment_id", rows.map((row) => row.id)).is("completata_il", null),
  ]);
  for (const row of rows) {
    const task = (tasks ?? []).find((item) => item.cadence_enrollment_id === row.id);
    out.set(row.opportunity_id, {
      id: row.id,
      cadenceId: row.cadence_id,
      cadenza: row.cadence?.nome ?? "Cadenza",
      stato: row.stato,
      passo: row.step?.posizione ?? null,
      passi: (steps ?? []).filter((step) => step.cadence_id === row.cadence_id).length,
      contatto: row.contact ? [row.contact.nome, row.contact.cognome].filter(Boolean).join(" ") || null : null,
      prossimoIl: task?.scadenza ?? null,
      taskId: task?.id ?? null,
      avvio: row.avvio,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Email steps (B4, B5)
// ---------------------------------------------------------------------------

export type CadenceEmailStep = {
  taskId: string;
  scadenza: string | null;
  titolo: string;
  opportunityId: string;
  partyId: string;
  party: string;
  contactId: string | null;
  // Active version of the step's template.
  templateId: string | null;
  enrollmentId: string;
};

// Email steps of a user due before `until` (all of them when userId is
// null: used to check one task).
export async function listCadenceEmailSteps(input: { userId?: string; until?: Date; taskId?: string }): Promise<CadenceEmailStep[]> {
  const supabase = await createClient();
  let query = supabase
    .from("tasks")
    .select(
      "id, scadenza, titolo, opportunity_id, party_id, cadence_enrollment_id, " +
        "enrollment:cadence_enrollments!tasks_cadence_enrollment_id_fkey(contact_id, stato), " +
        "step:cadence_steps!tasks_cadence_step_id_fkey(template_famiglia_id), " +
        "party:parties!tasks_party_id_fkey(denominazione, nome, cognome)",
    )
    .eq("tipo", "email")
    .not("cadence_enrollment_id", "is", null)
    .is("completata_il", null)
    .order("scadenza");
  if (input.userId) query = query.eq("assegnatario_id", input.userId);
  if (input.until) query = query.lt("scadenza", input.until.toISOString());
  if (input.taskId) query = query.eq("id", input.taskId);
  const { data, error } = await query;
  if (error) fail("tasks", error);
  const rows = (data ?? []) as unknown as {
    id: string;
    scadenza: string | null;
    titolo: string;
    opportunity_id: string;
    party_id: string;
    cadence_enrollment_id: string;
    enrollment: { contact_id: string | null; stato: EnrollmentState } | null;
    step: { template_famiglia_id: string | null } | null;
    party: { denominazione: string | null; nome: string | null; cognome: string | null } | null;
  }[];
  const families = [...new Set(rows.map((row) => row.step?.template_famiglia_id).filter((id): id is string => Boolean(id)))];
  const { data: templates } = families.length
    ? await supabase.from("email_templates").select("id, famiglia_id").in("famiglia_id", families).eq("corrente", true)
    : { data: [] as { id: string; famiglia_id: string }[] };
  return rows
    .filter((row) => row.enrollment?.stato === "attiva")
    .map((row) => ({
      taskId: row.id,
      scadenza: row.scadenza,
      titolo: row.titolo,
      opportunityId: row.opportunity_id,
      partyId: row.party_id,
      party: row.party?.denominazione ?? ([row.party?.nome, row.party?.cognome].filter(Boolean).join(" ") || "Soggetto"),
      contactId: row.enrollment?.contact_id ?? null,
      templateId: (templates ?? []).find((template) => template.famiglia_id === row.step?.template_famiglia_id)?.id ?? null,
      enrollmentId: row.cadence_enrollment_id,
    }));
}

export function prepareEmailHref(step: CadenceEmailStep): string {
  const params = new URLSearchParams({ soggetto: step.partyId, opportunita: step.opportunityId, passo: step.taskId });
  if (step.contactId) params.set("contatto", step.contactId);
  if (step.templateId) params.set("template", step.templateId);
  return `/email/prepara?${params.toString()}`;
}

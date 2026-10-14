import { describe } from "@/components/parties/history-list";
import { listHistory, type HistoryEntry } from "@/lib/parties/queries";
import { createClient } from "@/lib/supabase/server";
import { ACTIVITY_LABELS, CALL_OUTCOME_LABELS, type ActivityKind, type CallOutcome } from "./labels";

// One history (CRM-20) for a party or an opportunity, newest first:
// activities (also those of the Excel import), stage and outcome changes,
// changed notes, the import the record came from and, for a party, the
// changes to its data, locations and contacts. Author by name.

export type TimelineEntry = {
  id: string;
  when: string;
  author: string | null;
  kind: "attivita" | "cambio_fase" | "note" | "import" | "dati";
  title: string;
  detail: string | null;
  lines: string[];
  // Car park, when the entry belongs to an opportunity (party page).
  context: string | null;
};

type Named = { nome: string | null; email: string } | null;
const nameOf = (user: Named) => (user ? user.nome?.trim() || user.email : null);

async function names(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase.from("users").select("id, nome, email").in("id", unique);
  (data ?? []).forEach((user) => out.set(user.id, user.nome?.trim() || user.email));
  return out;
}

function activityTitle(tipo: ActivityKind | "cambio_fase", esito: string | null): string {
  if (tipo === "cambio_fase") return "Cambio di fase";
  const label = ACTIVITY_LABELS[tipo] ?? "Attività";
  return esito && esito in CALL_OUTCOME_LABELS ? `${label}: ${CALL_OUTCOME_LABELS[esito as CallOutcome].toLowerCase()}` : label;
}

export async function listTimeline(scope: { partyId: string; opportunityId?: string; contactIds?: string[]; locationIds?: string[] }, limit = 150): Promise<TimelineEntry[]> {
  const supabase = await createClient();

  const { data: opportunities } = await supabase
    .from("opportunities")
    .select("id, import_batch_id, created_at, parking:parking_facilities!opportunities_parking_id_fkey(nome, nome_breve)")
    .eq(scope.opportunityId ? "id" : "party_id", scope.opportunityId ?? scope.partyId);
  const opps = (opportunities ?? []) as unknown as {
    id: string;
    import_batch_id: string | null;
    created_at: string;
    parking: { nome: string; nome_breve: string | null } | null;
  }[];
  const parkingOf = new Map(opps.map((opp) => [opp.id, opp.parking ? (opp.parking.nome_breve ?? opp.parking.nome) : null]));

  // Activities of the opportunity, or of the party and all its opportunities.
  let activityQuery = supabase
    .from("activities")
    .select("id, tipo, esito, testo, avvenuta_il, opportunity_id, import_batch_id, user:users!activities_user_id_fkey(nome, email)")
    .order("avvenuta_il", { ascending: false })
    .limit(limit);
  activityQuery = scope.opportunityId
    ? activityQuery.eq("opportunity_id", scope.opportunityId)
    : opps.length > 0
      ? activityQuery.or(`party_id.eq.${scope.partyId},opportunity_id.in.(${opps.map((opp) => opp.id).join(",")})`)
      : activityQuery.eq("party_id", scope.partyId);
  const { data: activities, error } = await activityQuery;
  if (error) throw new Error(`activities: ${error.code ?? error.message}`);

  const entries: TimelineEntry[] = (
    (activities ?? []) as unknown as {
      id: string;
      tipo: ActivityKind | "cambio_fase";
      esito: string | null;
      testo: string | null;
      avvenuta_il: string;
      opportunity_id: string | null;
      import_batch_id: string | null;
      user: Named;
    }[]
  ).map((row) => ({
    id: `a-${row.id}`,
    when: row.avvenuta_il,
    author: nameOf(row.user) ?? (row.import_batch_id ? "Import Excel" : null),
    kind: row.tipo === "cambio_fase" ? "cambio_fase" : "attivita",
    title: activityTitle(row.tipo, row.esito),
    detail: row.testo,
    lines: [],
    context: !scope.opportunityId && row.opportunity_id ? (parkingOf.get(row.opportunity_id) ?? null) : null,
  }));

  // Changed notes and (party page) changed data, from the audit log.
  const { data: party } = await supabase.from("parties").select("import_batch_id, created_at").eq("id", scope.partyId).maybeSingle();
  const history: HistoryEntry[] = scope.opportunityId ? [] : await listHistory(scope.partyId, scope.contactIds ?? [], scope.locationIds ?? [], limit);
  for (const entry of history) {
    if (entry.entita === "parties" && entry.azione === "update" && entry.prima?.note !== entry.dopo?.note) {
      entries.push({
        id: `n-${entry.id}`,
        when: entry.quando,
        author: entry.utente,
        kind: "note",
        title: entry.dopo?.note ? "Note modificate" : "Note cancellate",
        detail: typeof entry.dopo?.note === "string" ? entry.dopo.note : null,
        lines: [],
        context: null,
      });
    }
    const { title, changes } = describe(entry);
    if (entry.azione === "update" && changes.length === 0) continue;
    if (entry.entita === "parties" && entry.azione === "insert" && party?.import_batch_id) continue;
    entries.push({ id: `d-${entry.id}`, when: entry.quando, author: entry.utente, kind: "dati", title, detail: null, lines: changes, context: null });
  }

  // Imports the party or the opportunities came from.
  const batchIds = [...new Set([party?.import_batch_id, ...opps.map((opp) => opp.import_batch_id)].filter((id): id is string => Boolean(id)))];
  if (batchIds.length > 0) {
    const { data: batches } = await supabase.from("import_batches").select("id, file, created_at, utente_id, annullato_il").in("id", batchIds);
    const users = await names((batches ?? []).map((batch) => batch.utente_id ?? ""));
    for (const batch of batches ?? []) {
      entries.push({
        id: `i-${batch.id}`,
        when: batch.created_at,
        author: batch.utente_id ? (users.get(batch.utente_id) ?? null) : null,
        kind: "import",
        title: `Importato dal file ${batch.file}`,
        detail: batch.annullato_il ? "Import poi annullato" : null,
        lines: [],
        context: null,
      });
    }
  }
  const { data: google } = await supabase
    .from("external_references")
    .select("id, created_at, created_by")
    .eq("sistema", "google_places")
    .eq("entita", "parties")
    .eq("entita_id", scope.partyId)
    .maybeSingle();
  if (google) {
    const users = await names([google.created_by ?? ""]);
    entries.push({
      id: `g-${google.id}`,
      when: google.created_at,
      author: google.created_by ? (users.get(google.created_by) ?? null) : null,
      kind: "import",
      title: "Importato dalla ricerca su mappa (Google Places)",
      detail: null,
      lines: [],
      context: null,
    });
  }

  return entries.sort((a, b) => Date.parse(b.when) - Date.parse(a.when)).slice(0, limit);
}

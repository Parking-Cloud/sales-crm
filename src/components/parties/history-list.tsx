import { formatDate } from "@/lib/format";
import type { HistoryEntry } from "@/lib/parties/queries";

// Readable change history from audit_logs: who, what, when.

const FIELD_LABELS: Record<string, string> = {
  tipo: "Tipo",
  denominazione: "Denominazione",
  nome: "Nome",
  cognome: "Cognome",
  categoria: "Categoria",
  piva: "Partita IVA",
  codice_fiscale: "Codice fiscale",
  sito: "Sito",
  telefono: "Telefono",
  email: "Email",
  dipendenti_stimati: "Dipendenti stimati",
  parcheggio_privato: "Parcheggio privato",
  non_contattare: "Non contattare",
  merged_into_id: "Unito in un altro soggetto",
  form_web_url: "Form sul sito",
  ruolo: "Ruolo",
  canale_preferito: "Canale preferito",
  party_id: "Soggetto",
  indirizzo: "Indirizzo",
  cap: "CAP",
  citta: "Città",
  principale: "Sede principale",
  lat: "Latitudine",
  lng: "Longitudine",
};

const HIDDEN = new Set([
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "dominio",
  "import_batch_id",
  "coordinate_fonte",
  "coordinate_aggiornate_il",
  // Notes have their own entries in the history (block 1a-6).
  "note",
  "note_modificate_da",
  "note_modificate_il",
]);

const TIME = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "vuoto";
  if (value === true) return "sì";
  if (value === false) return "no";
  return String(value);
}

export function describe(entry: HistoryEntry): { title: string; changes: string[] } {
  const subject = entry.entita === "contacts" ? "il contatto" : entry.entita === "party_locations" ? "la sede" : "il soggetto";
  const name = (row: Record<string, unknown> | null) =>
    !row
      ? ""
      : entry.entita === "party_locations"
        ? [row.indirizzo, row.citta].filter(Boolean).join(", ")
        : [row.denominazione, row.nome, row.cognome].filter(Boolean).join(" ");
  if (entry.azione === "insert") return { title: `ha creato ${subject} ${name(entry.dopo)}`.trim(), changes: [] };
  if (entry.azione === "delete") return { title: `ha eliminato ${subject} ${name(entry.prima)}`.trim(), changes: [] };

  const changes = Object.keys(entry.dopo ?? {})
    .filter((key) => !HIDDEN.has(key) && JSON.stringify(entry.prima?.[key]) !== JSON.stringify(entry.dopo?.[key]))
    .map((key) =>
      key === "merged_into_id"
        ? FIELD_LABELS[key]
        : `${FIELD_LABELS[key] ?? key}: da ${show(entry.prima?.[key])} a ${show(entry.dopo?.[key])}`,
    );
  return { title: `ha modificato ${subject}${entry.entita !== "parties" ? ` ${name(entry.dopo)}` : ""}`, changes };
}

export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) return <p className="text-body text-black-60">Nessuna modifica registrata.</p>;
  return (
    <ol className="flex flex-col gap-4">
      {entries.map((entry) => {
        const { title, changes } = describe(entry);
        return (
          <li key={entry.id} className="border-l-2 border-grey-60 pl-4">
            <p className="text-caption text-black-60">
              <time dateTime={entry.quando}>
                {formatDate(entry.quando)} alle {TIME.format(new Date(entry.quando))}
              </time>
            </p>
            <p className="text-body">
              <strong>{entry.utente ?? "Sistema"}</strong> {title}
            </p>
            {changes.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-caption text-black-80">
                {changes.map((change) => (
                  <li key={change} className="break-words">
                    {change}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

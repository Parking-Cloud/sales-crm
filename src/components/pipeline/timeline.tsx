import { Badge, type BadgeTone } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { TimelineEntry } from "@/lib/pipeline/history";

const TIME = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });

const KINDS: Record<TimelineEntry["kind"], { label: string; tone: BadgeTone }> = {
  attivita: { label: "Attività", tone: "info" },
  cambio_fase: { label: "Fase", tone: "success" },
  note: { label: "Note", tone: "neutral" },
  import: { label: "Import", tone: "neutral" },
  dati: { label: "Dati", tone: "neutral" },
};

// Unified history (CRM-20): what happened, who and when, newest first.
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return <p className="text-body text-black-60">Ancora niente nello storico.</p>;
  return (
    <ol className="flex flex-col gap-4">
      {entries.map((entry) => (
        <li key={entry.id} className="border-l-2 border-grey-60 pl-4">
          <p className="flex flex-wrap items-center gap-2 text-caption text-black-60">
            <time dateTime={entry.when}>
              {formatDate(entry.when)} alle {TIME.format(new Date(entry.when))}
            </time>
            <Badge tone={KINDS[entry.kind].tone}>{KINDS[entry.kind].label}</Badge>
            {entry.context && <span>· {entry.context}</span>}
          </p>
          <p className="text-body">
            <strong>{entry.author ?? "Sistema"}</strong> {entry.kind === "dati" ? entry.title : `· ${entry.title}`}
          </p>
          {entry.detail && <p className="mt-1 text-body whitespace-pre-line text-black-80 break-words">{entry.detail}</p>}
          {entry.lines.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-caption text-black-80">
              {entry.lines.map((line) => (
                <li key={line} className="break-words">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

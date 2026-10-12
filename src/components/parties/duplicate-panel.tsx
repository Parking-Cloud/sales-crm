import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { DuplicateMatch } from "@/lib/parties/queries";

function MatchList({ matches, warning }: { matches: DuplicateMatch[]; warning: boolean }) {
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {matches.map((match, index) => (
        <li key={`${match.motivo}-${match.party_id ?? index}`} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            <strong>{match.motivo}</strong>
            {match.nome && <>: {match.nome}</>}
          </span>
          {match.party_id && (
            <Link
              href={`/soggetti/${match.party_id}`}
              className="rounded-xs font-semibold text-blue-ink underline underline-offset-2"
            >
              {warning ? "È lo stesso: apri" : "Apri il soggetto esistente"}
              {match.nome && <span className="sr-only"> {match.nome}</span>}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

// Result of the duplicate check above the form: blocks cannot be saved,
// warnings can be confirmed as different.
export function DuplicatePanel({
  level,
  matches,
  pending,
}: {
  level: "blocco" | "avviso";
  matches: DuplicateMatch[];
  pending: boolean;
}) {
  if (level === "blocco") {
    return (
      <Alert tone="critical" title="Non si può salvare: il soggetto esiste già o non va contattato">
        <MatchList matches={matches} warning={false} />
      </Alert>
    );
  }
  return (
    <Alert tone="warning" title="Possibile doppione">
      <p>Controlla se è lo stesso soggetto prima di continuare.</p>
      <MatchList matches={matches} warning />
      <div className="mt-3">
        <Button type="submit" name="ignora_avvisi" value="1" disabled={pending}>
          Sono diversi: continua
        </Button>
      </div>
    </Alert>
  );
}

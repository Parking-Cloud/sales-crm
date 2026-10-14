"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { undoImport } from "@/app/(app)/import/actions";
import type { UndoBlocked, UndoBlocker } from "@/lib/import/undo";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDate, formatNumber } from "@/lib/format";
import { safeCall } from "@/lib/import/safe-call";
import { toText } from "@/lib/import/values";

// Singular and plural names of what blocks the undo, by table.
const KINDS: Record<string, [string, string]> = {
  parties: ["modifica al soggetto", "modifiche al soggetto"],
  contacts: ["contatto", "contatti"],
  party_locations: ["sede", "sedi"],
  opportunities: ["opportunità", "opportunità"],
  activities: ["attività", "attività"],
  offers: ["offerta", "offerte"],
};
const ORDER = Object.keys(KINDS);
const SHOWN_PARTIES = 20;

function kindLabel(tabella: string, n: number): string {
  const [one, many] = KINDS[tabella] ?? ["dato", "dati"];
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

type PartyGroup = { key: string; partyId: string | null; soggetto: string; counts: Map<string, number> };

function byParty(blockers: UndoBlocker[]): PartyGroup[] {
  const groups = new Map<string, PartyGroup>();
  for (const blocker of blockers) {
    const key = blocker.partyId ?? `senza-${toText(blocker.soggetto)}`;
    const group = groups.get(key) ?? { key, partyId: blocker.partyId, soggetto: toText(blocker.soggetto), counts: new Map() };
    group.counts.set(blocker.tabella, (group.counts.get(blocker.tabella) ?? 0) + 1);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.soggetto.localeCompare(b.soggetto, "it"));
}

function PartyItem({ group }: { group: PartyGroup }) {
  const summary = [...group.counts.entries()]
    .sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b))
    .map(([tabella, n]) => kindLabel(tabella, n))
    .join(", ");
  return (
    <li className="py-2">
      {group.partyId ? (
        <Link href={`/soggetti/${group.partyId}`} className="rounded-xs font-semibold text-blue-ink underline underline-offset-2">
          {group.soggetto}
        </Link>
      ) : (
        <span className="font-semibold">{group.soggetto}</span>
      )}
      <span className="block text-caption text-black-80">{summary}</span>
    </li>
  );
}

// Why the undo is refused: what caused it (another import or changes by
// hand, with what to do) and the parties involved, readable also when long.
export function UndoBlockedView({ blocked }: { blocked: UndoBlocked }) {
  const groups = byParty(blocked.blockers);
  const first = groups.slice(0, SHOWN_PARTIES);
  const rest = groups.slice(SHOWN_PARTIES);
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="warning" title="Annullamento bloccato">
        Dopo questo import sono stati aggiunti o modificati {formatNumber(blocked.totale)}{" "}
        {blocked.totale === 1 ? "dato" : "dati"} sui suoi soggetti. Finché ci sono, l&apos;import non si può annullare:
        nessun dato è stato cancellato.
      </Alert>

      <section aria-labelledby="blocchi-cause" className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
        <h2 id="blocchi-cause" className="text-h4 font-semibold">
          Da dove arrivano
        </h2>
        <ul className="mt-3 flex flex-col gap-3">
          {blocked.cause.map((cause) => (
            <li key={cause.batchId ?? "a-mano"} className="text-body">
              {cause.batchId ? (
                <>
                  <strong>{formatNumber(cause.n)}</strong> da un altro import:{" "}
                  <Link href={`/import/${cause.batchId}`} className="rounded-xs font-semibold break-words text-blue-ink underline underline-offset-2">
                    {toText(cause.file) || "import"}
                    {cause.createdAt ? ` del ${formatDate(cause.createdAt)}` : ""}
                  </Link>
                  <span className="block text-caption text-black-80">
                    Annulla prima quell&apos;import, poi riprova questo.
                  </span>
                </>
              ) : (
                <>
                  <strong>{formatNumber(cause.n)}</strong> {cause.n === 1 ? "modifica fatta" : "modifiche fatte"} a mano
                  <span className="block text-caption text-black-80">
                    Apri i soggetti qui sotto e togli quello che è stato aggiunto o modificato, poi riprova.
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="blocchi-soggetti" className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
        <h2 id="blocchi-soggetti" className="text-h4 font-semibold">
          Soggetti coinvolti ({formatNumber(groups.length)})
        </h2>
        {blocked.totale > blocked.blockers.length && (
          <p className="mt-1 text-caption text-black-60">
            Elenco dei primi {formatNumber(blocked.blockers.length)} dati su {formatNumber(blocked.totale)}.
          </p>
        )}
        <ul className="mt-2 divide-y divide-grey-60">
          {first.map((group) => (
            <PartyItem key={group.key} group={group} />
          ))}
        </ul>
        {rest.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer rounded-xs py-2 font-semibold text-blue-ink underline underline-offset-2">
              Mostra gli altri {formatNumber(rest.length)} soggetti
            </summary>
            <ul className="divide-y divide-grey-60">
              {rest.map((group) => (
                <PartyItem key={group.key} group={group} />
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}

// "Annulla import": confirmation, then either done (the page reloads as a
// cancelled import) or the view of what is in the way.
export function UndoControl({
  batchId,
  initiallyOpen = false,
  initialBlocked = null,
  action = undoImport,
}: {
  batchId: string;
  // For previews and end-to-end tests only.
  initiallyOpen?: boolean;
  initialBlocked?: UndoBlocked | null;
  action?: typeof undoImport;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  const [blocked, setBlocked] = useState<UndoBlocked | null>(initialBlocked);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const resultRef = useRef<HTMLDivElement>(null);

  // The outcome appears below the summary: bring it into view.
  useEffect(() => {
    if (error || blocked) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [error, blocked]);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await safeCall(() => action(batchId));
      setOpen(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setBlocked(result.data.blocked);
      if (!result.data.blocked) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="destructive" size="md" onClick={() => setOpen(true)} disabled={pending}>
          {pending ? "Annullamento..." : "Annulla import"}
        </Button>
      </div>
      <div ref={resultRef} className="flex scroll-mt-4 flex-col gap-4">
        {error && <Alert tone="critical">{error}</Alert>}
        {blocked && <UndoBlockedView blocked={blocked} />}
      </div>
      <ConfirmDialog
        open={open}
        title="Annullare questo import?"
        confirmLabel="Annulla import"
        cancelLabel="Lascia com'è"
        confirmVariant="destructive"
        pending={pending}
        onConfirm={run}
        onCancel={() => setOpen(false)}
      >
        <p>
          Vengono cancellati soltanto soggetti, contatti, opportunità, attività e offerte creati da questo import.
          Se qualcuno li ha già modificati o arricchiti, l&apos;annullamento si ferma e ti mostra cosa.
        </p>
      </ConfirmDialog>
    </div>
  );
}

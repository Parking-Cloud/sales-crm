"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { undoImport, type UndoBlocker } from "@/app/(app)/import/actions";
import { safeCall } from "@/lib/import/safe-call";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

const LINKS: Record<string, string> = { parties: "/soggetti/" };

// "Annulla import": confirmation, then either done or the list of what is
// in the way (records changed or added after the import).
export function UndoControl({
  batchId,
  initiallyOpen = false,
  initialBlockers = null,
}: {
  batchId: string;
  // For previews only.
  initiallyOpen?: boolean;
  initialBlockers?: UndoBlocker[] | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  const [blockers, setBlockers] = useState<UndoBlocker[] | null>(initialBlockers);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await safeCall(() => undoImport(batchId));
      setOpen(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setBlockers(result.data.blockers.length > 0 ? result.data.blockers : null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button variant="destructive" size="md" onClick={() => setOpen(true)} disabled={pending}>
          Annulla import
        </Button>
      </div>
      {error && <Alert tone="critical">{error}</Alert>}
      {blockers && (
        <Alert tone="warning" title="Annullamento bloccato">
          <p>Dopo l&apos;import qualcuno ha lavorato su questi dati. Sistemali, poi riprova.</p>
          <ul className="mt-2 list-disc pl-5">
            {blockers.map((blocker) => (
              <li key={`${blocker.tabella}-${blocker.id}-${blocker.descrizione}`}>
                {LINKS[blocker.tabella] ? (
                  <Link href={`${LINKS[blocker.tabella]}${blocker.id}`} className="rounded-xs underline underline-offset-2">
                    {blocker.descrizione}
                  </Link>
                ) : (
                  blocker.descrizione
                )}
              </li>
            ))}
          </ul>
        </Alert>
      )}
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

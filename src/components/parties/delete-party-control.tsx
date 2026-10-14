"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteParty, partyDeleteSummary, type DeleteSummary } from "@/app/(app)/soggetti/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { safeCall } from "@/lib/import/safe-call";

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// "Elimina soggetto" (administrators): the confirmation names the party and
// says what goes with it.
export function DeletePartyControl({ partyId, partyName }: { partyId: string; partyName: string }) {
  const router = useRouter();
  const [summary, setSummary] = useState<DeleteSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    setError(null);
    startTransition(async () => {
      const result = await safeCall(() => partyDeleteSummary(partyId));
      if (!result.ok) return setError(result.message);
      setSummary(result.data);
    });
  }

  function confirm() {
    startTransition(async () => {
      const result = await safeCall(() => deleteParty(partyId));
      if (!result.ok) {
        setSummary(null);
        return setError(result.message);
      }
      router.push("/soggetti");
    });
  }

  return (
    <>
      <Button variant="destructive" onClick={open} disabled={pending}>
        Elimina soggetto
      </Button>
      {error && (
        <Alert tone="critical" className="basis-full">
          {error}
        </Alert>
      )}
      <ConfirmDialog
        open={summary !== null}
        title={`Eliminare "${partyName}"?`}
        confirmLabel="Elimina definitivamente"
        cancelLabel="Lascia com'è"
        confirmVariant="destructive"
        pending={pending}
        onConfirm={confirm}
        onCancel={() => setSummary(null)}
      >
        {summary && (
          <>
            <p>Si cancellano insieme al soggetto, senza possibilità di recupero:</p>
            <ul className="mt-2 list-disc pl-5">
              <li>{count(summary.sedi, "sede", "sedi")}</li>
              <li>{count(summary.contatti, "contatto", "contatti")}</li>
              <li>{count(summary.opportunita, "opportunità", "opportunità")}</li>
              <li>{count(summary.attivita, "attività", "attività")}</li>
              {summary.offerte > 0 && <li>{count(summary.offerte, "offerta", "offerte")}</li>}
              {summary.uniti > 0 && <li>{count(summary.uniti, "soggetto unito a questo", "soggetti uniti a questo")}</li>}
            </ul>
            <p className="mt-2">L&apos;eliminazione resta nel registro delle modifiche con il tuo nome.</p>
          </>
        )}
      </ConfirmDialog>
    </>
  );
}

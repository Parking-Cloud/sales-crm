"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { gdprErase } from "@/app/(app)/prospect/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/field";
import { safeCall } from "@/lib/import/safe-call";

const CONFIRM_WORD = "CANCELLA";

// "Cancella per richiesta GDPR" (CRM-31, administrators): personal data are
// deleted or blanked for good; only a hash of the identifying values stays
// in the suppression list, so the person is not contacted or imported again.
export function GdprEraseControl({
  entita,
  id,
  partyId,
  name,
  size = "sm",
}: {
  entita: "parties" | "contacts";
  id: string;
  partyId: string;
  name: string;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const wordId = useId();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (word.trim().toUpperCase() !== CONFIRM_WORD) return setError(`Scrivi ${CONFIRM_WORD} per confermare.`);
    setError(null);
    startTransition(async () => {
      const result = await safeCall(() => gdprErase(entita, id, partyId));
      if (!result.ok) return setError(result.message);
      setOpen(false);
      setWord("");
      setDone(
        `Cancellazione eseguita: ${result.data.contatti} contatti, ${result.data.sedi} sedi, ${result.data.email} email; ` +
          `${result.data.valori_in_esclusione} valori restano in lista di esclusione solo in forma non leggibile.`,
      );
      router.refresh();
    });
  }

  return (
    <>
      <Button size={size} variant="destructive" onClick={() => setOpen(true)}>
        Cancella per richiesta GDPR<span className="sr-only"> {name}</span>
      </Button>
      {done && (
        <Alert tone="success" className="basis-full">
          {done}
        </Alert>
      )}
      <ConfirmDialog
        open={open}
        title={`Cancellare i dati di ${name} per richiesta GDPR?`}
        confirmLabel="Cancella i dati personali"
        cancelLabel="Annulla"
        confirmVariant="destructive"
        pending={pending}
        onConfirm={confirm}
        onCancel={() => {
          setOpen(false);
          setError(null);
          setWord("");
        }}
      >
        <p>Operazione definitiva, senza recupero:</p>
        <ul className="mt-2 list-disc pl-5">
          {entita === "parties" ? (
            <>
              <li>il nome diventa &ldquo;Prospect cancellato (GDPR)&rdquo;; recapiti, P.IVA, sito e note si cancellano;</li>
              <li>si cancellano contatti, sedi, permessi email e provenienza dei dati;</li>
              <li>le opportunità aperte si chiudono come perse; attività ed email restano senza testo né destinatario;</li>
            </>
          ) : (
            <>
              <li>il contatto si cancella, con i suoi permessi email;</li>
              <li>attività ed email verso di lui restano senza testo né destinatario;</li>
            </>
          )}
          <li>
            in lista di esclusione resta solo un&apos;impronta non leggibile di telefoni, email e altri identificativi, che blocca
            nuovi contatti e nuovi import;
          </li>
          <li>il registro conserva chi ha cancellato e quando, senza i dati cancellati.</li>
        </ul>
        <label htmlFor={wordId} className="mt-4 block text-label font-semibold tracking-[0.08em] text-black-80 uppercase">
          Scrivi {CONFIRM_WORD} per confermare
        </label>
        <Input id={wordId} className="mt-2" value={word} autoComplete="off" onChange={(event) => setWord(event.target.value)} invalid={Boolean(error)} />
        {error && <p className="mt-2 text-caption text-error-ink">{error}</p>}
      </ConfirmDialog>
    </>
  );
}

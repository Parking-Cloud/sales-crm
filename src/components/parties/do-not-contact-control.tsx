"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { clearDoNotContact, markDoNotContact } from "@/app/(app)/soggetti/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/field";

// "Non contattare" for a party or a contact: confirmation with a mandatory
// reason; the values go to the suppression list. Only administrators see
// "Togli non contattare".
export function DoNotContactControl({
  entita,
  id,
  partyId,
  name,
  active,
  isAdmin,
  initiallyOpen = false,
  size = "sm",
}: {
  entita: "parties" | "contacts";
  id: string;
  partyId: string;
  name: string;
  active: boolean;
  isAdmin: boolean;
  // For previews only.
  initiallyOpen?: boolean;
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const reasonId = useId();
  const [open, setOpen] = useState(initiallyOpen);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<{ ok: boolean; message?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        setError(result.message ?? "Operazione non riuscita.");
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  if (active) {
    if (!isAdmin) return null;
    return (
      <>
        <Button size={size} onClick={() => run(() => clearDoNotContact(entita, id, partyId))} disabled={pending}>
          {pending ? "Attendi..." : "Togli “Non contattare”"}
          <span className="sr-only"> per {name}</span>
        </Button>
        {error && <Alert tone="critical" className="mt-2 w-full">{error}</Alert>}
      </>
    );
  }

  return (
    <>
      <Button size={size} variant="secondary" onClick={() => setOpen(true)} className="text-error-ink">
        Non contattare<span className="sr-only"> {name}</span>
      </Button>
      <ConfirmDialog
        open={open}
        title={`Non contattare ${name}?`}
        confirmLabel="Conferma: non contattare"
        confirmVariant="destructive"
        pending={pending}
        onConfirm={() => {
          if (reason.trim() === "") {
            setError("Scrivi il motivo.");
            return;
          }
          run(() => markDoNotContact(entita, id, partyId, reason));
        }}
        onCancel={() => {
          setOpen(false);
          setError(null);
        }}
      >
        <p>
          Telefoni, email{entita === "parties" ? ", dominio del sito e recapiti dei contatti" : ""} entrano nella
          lista di esclusione: nessuno potrà più contattarli e i nuovi doppioni verranno bloccati. Solo
          l&apos;amministratore può annullarlo.
        </p>
        <label htmlFor={reasonId} className="mt-4 block text-label font-semibold tracking-[0.08em] text-black-80 uppercase">
          Motivo<span aria-hidden="true" className="ml-0.5 text-error">*</span>
        </label>
        <Textarea
          id={reasonId}
          className="mt-2"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Per esempio: ha chiesto di non essere più contattato al telefono"
          invalid={Boolean(error)}
        />
        {error && <p className="mt-2 text-caption text-error-ink">{error}</p>}
      </ConfirmDialog>
    </>
  );
}

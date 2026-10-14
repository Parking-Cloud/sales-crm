"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { clearDoNotContact, markDoNotContact } from "@/app/(app)/soggetti/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, Textarea } from "@/components/ui/field";
import { OPPOSITION_CHANNELS, OPPOSITION_CHANNEL_LABELS } from "@/lib/suppression/labels";

// "Non contattare" for a party or a contact (any user): reason and channel
// the request came from are required; the values go to the suppression
// list, open opportunities are closed as lost and emails and imports are
// blocked. Only administrators see "Togli non contattare".
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
  const channelId = useId();
  const [channel, setChannel] = useState("");
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
      setChannel("");
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
          if (!channel) {
            setError("Indica da dove arriva la richiesta.");
            return;
          }
          run(() => markDoNotContact(entita, id, partyId, reason, channel));
        }}
        onCancel={() => {
          setOpen(false);
          setError(null);
        }}
      >
        <p>
          {entita === "parties"
            ? "Telefoni, email, dominio del sito, partita IVA, luogo Google e recapiti dei contatti"
            : "Telefoni ed email del contatto"}{" "}
          entrano nella lista di esclusione. Da subito:
        </p>
        <ul className="mt-2 list-disc pl-5">
          <li>
            le opportunità aperte {entita === "parties" ? "del soggetto" : "collegate al contatto"} si chiudono come perse
            (&ldquo;ha chiesto di non essere contattato&rdquo;) e i loro promemoria si chiudono;
          </li>
          <li>non si possono più preparare email;</li>
          <li>gli import da file e dalla mappa con gli stessi dati vengono bloccati.</li>
        </ul>
        <p className="mt-2">Solo l&apos;amministratore può annullarlo.</p>
        <label htmlFor={channelId} className="mt-4 block text-label font-semibold tracking-[0.08em] text-black-80 uppercase">
          Da dove arriva la richiesta<span aria-hidden="true" className="ml-0.5 text-error">*</span>
        </label>
        <Select id={channelId} className="mt-2" value={channel} onChange={(event) => setChannel(event.target.value)}>
          <option value="">Scegli…</option>
          {OPPOSITION_CHANNELS.map((option) => (
            <option key={option} value={option}>
              {OPPOSITION_CHANNEL_LABELS[option]}
            </option>
          ))}
        </Select>
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

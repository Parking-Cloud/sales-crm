"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { addSuppression, removeSuppression } from "@/app/(app)/esclusioni/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { safeCall } from "@/lib/import/safe-call";
import {
  OPPOSITION_CHANNELS,
  OPPOSITION_CHANNEL_LABELS,
  SUPPRESSION_TYPES,
  SUPPRESSION_TYPE_LABELS,
} from "@/lib/suppression/labels";

const HINTS: Record<string, string> = {
  email: "Per esempio nome@azienda.it.",
  telefono: "Con o senza prefisso: si salva come +39.",
  dominio: "Il dominio del sito, senza www. Non i domini di posta generici.",
  piva: "11 cifre, con o senza IT.",
  place_id: "L'identificativo del luogo Google.",
};

// Manual entry (administrators).
export function AddSuppressionForm() {
  const router = useRouter();
  const [tipo, setTipo] = useState("email");
  const [valore, setValore] = useState("");
  const [motivo, setMotivo] = useState("");
  const [canale, setCanale] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "critical"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await safeCall(async () => {
        const outcome = await addSuppression({ tipo, valore, motivo, canale });
        return outcome.ok ? { ok: true as const, data: null } : outcome;
      });
      if (!result.ok) return setMessage({ tone: "critical", text: result.message });
      setValore("");
      setMotivo("");
      setCanale("");
      setMessage({ tone: "success", text: "Aggiunto alla lista di esclusione." });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_1fr]">
        <Field id="esclusione-tipo" label="Tipo">
          <Select id="esclusione-tipo" value={tipo} onChange={(event) => setTipo(event.target.value)}>
            {SUPPRESSION_TYPES.map((type) => (
              <option key={type} value={type}>
                {SUPPRESSION_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="esclusione-valore" label="Valore" hint={HINTS[tipo]} required>
          <Input id="esclusione-valore" value={valore} autoComplete="off" onChange={(event) => setValore(event.target.value)} hasDescription />
        </Field>
        <Field id="esclusione-canale" label="Da dove arriva">
          <Select id="esclusione-canale" value={canale} onChange={(event) => setCanale(event.target.value)}>
            <option value="">Non indicato</option>
            {OPPOSITION_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {OPPOSITION_CHANNEL_LABELS[channel]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="esclusione-motivo" label="Motivo" required>
        <Textarea id="esclusione-motivo" rows={2} maxLength={1000} value={motivo} onChange={(event) => setMotivo(event.target.value)} />
      </Field>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Salvataggio..." : "Aggiungi alla lista"}
        </Button>
      </div>
    </form>
  );
}

// Removal (administrators), with a reason; the entry stays as history.
export function RemoveSuppressionButton({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const reasonId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Rimuovi<span className="sr-only"> {label}</span>
      </Button>
      <ConfirmDialog
        open={open}
        title={`Rimuovere "${label}" dalla lista di esclusione?`}
        confirmLabel="Rimuovi"
        confirmVariant="destructive"
        pending={pending}
        onCancel={() => {
          setOpen(false);
          setError(null);
        }}
        onConfirm={() => {
          if (!reason.trim()) return setError("Scrivi il motivo della rimozione.");
          setError(null);
          startTransition(async () => {
            const result = await safeCall(async () => {
              const outcome = await removeSuppression(id, reason);
              return outcome.ok ? { ok: true as const, data: null } : outcome;
            });
            if (!result.ok) return setError(result.message);
            setOpen(false);
            setReason("");
            router.refresh();
          });
        }}
      >
        <p>Il valore potrà di nuovo essere contattato e importato. La rimozione resta nello storico con il tuo nome e il motivo.</p>
        <label htmlFor={reasonId} className="mt-4 block text-label font-semibold tracking-[0.08em] text-black-80 uppercase">
          Motivo<span aria-hidden="true" className="ml-0.5 text-error">*</span>
        </label>
        <Textarea id={reasonId} className="mt-2" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} invalid={Boolean(error)} />
        {error && <p className="mt-2 text-caption text-error-ink">{error}</p>}
      </ConfirmDialog>
    </>
  );
}

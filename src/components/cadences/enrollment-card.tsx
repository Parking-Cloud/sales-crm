"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { pauseCadence, resumeCadence, stopCadence } from "@/app/(app)/cadenze/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Textarea } from "@/components/ui/field";
import { ENROLLMENT_STATE_LABELS } from "@/lib/cadences/schedule";
import type { EnrollmentInfo } from "@/lib/cadences/queries";
import { safeCall } from "@/lib/import/safe-call";
import { formatWhen } from "@/components/pipeline/next-activity";
import { EnrollButton, type CadenceOption } from "./enroll-dialog";

type Actions = { pause: typeof pauseCadence; resume: typeof resumeCadence; stop: typeof stopCadence };

// Cadence of an opportunity (B6): name, current step, next date, contact;
// pause, resume and stop with a reason. Without a cadence: "Iscrivi".
export function EnrollmentCard({
  opportunityId,
  label,
  open,
  enrollment,
  cadences,
  actions = { pause: pauseCadence, resume: resumeCadence, stop: stopCadence },
}: {
  opportunityId: string;
  // Party and car park, for the summary of the enrollment.
  label: string;
  // The opportunity is open.
  open: boolean;
  enrollment: EnrollmentInfo | null;
  cadences: CadenceOption[];
  // For previews and end-to-end tests only.
  actions?: Actions;
}) {
  const router = useRouter();
  const reasonId = useId();
  const [stopping, setStopping] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(task: () => Promise<{ ok: true; data: null } | { ok: false; message: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await safeCall(task);
      if (!result.ok) return setError(result.message);
      setStopping(false);
      setReason("");
      router.refresh();
    });
  }

  if (!enrollment) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-black-60">Nessuna cadenza in corso.</p>
        {open && cadences.length > 0 && (
          <EnrollButton mode="opportunities" ids={[opportunityId]} cadences={cadences} names={{ [opportunityId]: label }} label="Iscrivi a una cadenza" />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2">
        <Link href={`/cadenze/${enrollment.cadenceId}`} className="rounded-xs font-semibold text-blue-ink underline underline-offset-2">
          {enrollment.cadenza}
        </Link>
        <Badge tone={enrollment.stato === "attiva" ? "info" : "attention"}>{ENROLLMENT_STATE_LABELS[enrollment.stato]}</Badge>
      </p>
      <dl className="grid gap-2 text-body">
        <div>
          <dt className="text-label font-semibold tracking-[0.08em] text-black-60 uppercase">Passo corrente</dt>
          <dd>{enrollment.passo ? `${enrollment.passo} di ${enrollment.passi}` : "–"}</dd>
        </div>
        <div>
          <dt className="text-label font-semibold tracking-[0.08em] text-black-60 uppercase">Prossimo passo</dt>
          <dd>{enrollment.prossimoIl ? formatWhen(enrollment.prossimoIl) : enrollment.stato === "in_pausa" ? "In pausa" : "–"}</dd>
        </div>
        <div>
          <dt className="text-label font-semibold tracking-[0.08em] text-black-60 uppercase">Contatto</dt>
          <dd>{enrollment.contatto ?? "–"}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        {enrollment.stato === "attiva" ? (
          <Button size="sm" disabled={pending} onClick={() => run(() => actions.pause(enrollment.id))}>
            Metti in pausa
          </Button>
        ) : (
          <Button size="sm" disabled={pending} onClick={() => run(() => actions.resume(enrollment.id))}>
            Riprendi
          </Button>
        )}
        <Button size="sm" variant="ghost" className="text-error-ink" disabled={pending} onClick={() => setStopping(true)}>
          Ferma la cadenza
        </Button>
      </div>
      {error && <Alert tone="critical">{error}</Alert>}
      <ConfirmDialog
        open={stopping}
        title={`Fermare la cadenza "${enrollment.cadenza}"?`}
        confirmLabel="Ferma la cadenza"
        confirmVariant="destructive"
        pending={pending}
        onCancel={() => setStopping(false)}
        onConfirm={() => {
          if (!reason.trim()) return setError("Scrivi il motivo.");
          run(() => actions.stop(enrollment.id, "manuale", reason));
        }}
      >
        <p>Il promemoria del passo corrente si toglie; il motivo resta nello storico.</p>
        <label htmlFor={reasonId} className="mt-4 block text-label font-semibold tracking-[0.08em] text-black-80 uppercase">
          Motivo<span aria-hidden="true" className="ml-0.5 text-error">*</span>
        </label>
        <Textarea id={reasonId} className="mt-2" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
        {error && <p className="mt-2 text-caption text-error-ink">{error}</p>}
      </ConfirmDialog>
    </div>
  );
}

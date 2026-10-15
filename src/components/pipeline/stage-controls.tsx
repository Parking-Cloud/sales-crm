"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { closeLost, moveStage, reopen } from "@/app/(app)/pipeline/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { safeCall } from "@/lib/import/safe-call";
import {
  HANDOFF_STAGE_NOTE,
  LOSS_REASONS,
  LOSS_REASON_LABELS,
  MANUAL_STAGES,
  STAGES,
  STAGE_LABELS,
  opportunityBadge,
  type LossReasonKey,
  type Outcome,
  type Stage,
} from "@/lib/pipeline/labels";

// "Sposta in…": the keyboard way to change stage (the kanban also has drag
// and drop). Handoff stages are listed but disabled, with the reason.
export function MoveToMenu({
  opportunityId,
  fase,
  label,
  onMoved,
  action = moveStage,
}: {
  opportunityId: string;
  fase: Stage;
  label: string;
  onMoved?: (fase: Stage) => void;
  action?: typeof moveStage;
}) {
  const router = useRouter();
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        Sposta {label} in un&apos;altra fase
      </label>
      <select
        id={id}
        value=""
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value as Stage;
          if (!next) return;
          setError(null);
          startTransition(async () => {
            const result = await safeCall(() => action(opportunityId, next));
            if (!result.ok) return setError(result.message);
            onMoved?.(next);
            router.refresh();
          });
        }}
        className="min-h-(--control-h) w-full cursor-pointer rounded-sm border border-brand-grey bg-white px-2 text-[13px] font-semibold text-brand-blue md:min-h-8"
      >
        <option value="">{pending ? "Spostamento..." : "Sposta in…"}</option>
        {STAGES.filter((stage) => stage !== fase).map((stage) => (
          <option key={stage} value={stage} disabled={!MANUAL_STAGES.includes(stage)}>
            {STAGE_LABELS[stage]}
            {MANUAL_STAGES.includes(stage) ? "" : " (fase 1b)"}
          </option>
        ))}
      </select>
      {error && <p role="alert" className="text-caption text-error-ink">{error}</p>}
    </div>
  );
}

export function StageSelect({ opportunityId, fase }: { opportunityId: string; fase: Stage }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Field id="fase" label="Fase" hint={MANUAL_STAGES.includes(fase) ? undefined : HANDOFF_STAGE_NOTE}>
        <Select
          id="fase"
          value={fase}
          disabled={pending || !MANUAL_STAGES.includes(fase)}
          hasDescription={!MANUAL_STAGES.includes(fase)}
          onChange={(event) => {
            const next = event.target.value as Stage;
            setError(null);
            startTransition(async () => {
              const result = await safeCall(() => moveStage(opportunityId, next));
              if (!result.ok) return setError(result.message);
              router.refresh();
            });
          }}
        >
          {STAGES.map((stage) => (
            <option key={stage} value={stage} disabled={!MANUAL_STAGES.includes(stage)}>
              {STAGE_LABELS[stage]}
              {MANUAL_STAGES.includes(stage) ? "" : " (con il passaggio al BO, fase 1b)"}
            </option>
          ))}
        </Select>
      </Field>
      {error && <Alert tone="critical">{error}</Alert>}
    </div>
  );
}

// "Chiudi come persa" (CRM-17): reason from the list (required), the
// competitor's price if known, a note (required with "Altro").
export function CloseLostButton({
  opportunityId,
  subject,
  initiallyOpen = false,
  action = closeLost,
}: {
  opportunityId: string;
  subject: string;
  // For previews and end-to-end tests only.
  initiallyOpen?: boolean;
  action?: typeof closeLost;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  const [motivo, setMotivo] = useState<LossReasonKey | "">("");
  const [prezzo, setPrezzo] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const noteRequired = motivo === "altro";

  function submit() {
    setError(null);
    if (!motivo) return setError("Scegli il motivo della perdita.");
    if (noteRequired && !nota.trim()) return setError("Con il motivo \"Altro\" scrivi una nota.");
    startTransition(async () => {
      const result = await safeCall(() => action({ opportunityId, motivo, prezzoConcorrente: prezzo, nota }));
      if (!result.ok) return setError(result.message);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Chiudi come persa</Button>
      <Dialog
        open={open}
        title={`Chiudere come persa: ${subject}`}
        busy={pending}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button size="md" disabled={pending} onClick={() => setOpen(false)}>
              Annulla
            </Button>
            <Button variant="primary" size="md" disabled={pending} aria-busy={pending || undefined} onClick={submit}>
              {pending ? "Salvataggio..." : "Chiudi come persa"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <fieldset>
            <legend className="text-label font-semibold tracking-[0.08em] text-black-80 uppercase">
              Motivo<span aria-hidden="true" className="ml-0.5 text-error">*</span>
              <span className="sr-only"> (obbligatorio)</span>
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {LOSS_REASONS.map((reason) => (
                <label key={reason} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-sm border border-grey-60 px-3 text-body has-checked:border-brand-blue has-checked:bg-blue-20">
                  <input
                    type="radio"
                    name="motivo"
                    value={reason}
                    checked={motivo === reason}
                    onChange={() => setMotivo(reason)}
                    className="size-4 accent-brand-blue"
                  />
                  {LOSS_REASON_LABELS[reason]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
            <Field id="prezzo-concorrente" label="Prezzo del concorrente" hint="Facoltativo, al mese, in euro.">
              <Input id="prezzo-concorrente" inputMode="decimal" value={prezzo} onChange={(event) => setPrezzo(event.target.value)} hasDescription />
            </Field>
            <Field id="nota-perdita" label="Nota" hint={noteRequired ? "Obbligatoria con il motivo Altro." : "Facoltativa."} required={noteRequired}>
              <Textarea id="nota-perdita" rows={3} maxLength={2000} value={nota} onChange={(event) => setNota(event.target.value)} hasDescription />
            </Field>
          </div>
          {error && <Alert tone="critical">{error}</Alert>}
        </div>
      </Dialog>
    </>
  );
}

// "Riapri": back to open, in the stage it had.
export function ReopenButton({ opportunityId, fase }: { opportunityId: string; fase: Stage }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button onClick={() => setOpen(true)}>Riapri</Button>
      {error && <Alert tone="critical">{error}</Alert>}
      <ConfirmDialog
        open={open}
        title="Riaprire l'opportunità?"
        confirmLabel="Riapri"
        pending={pending}
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          startTransition(async () => {
            const result = await safeCall(() => reopen(opportunityId));
            setOpen(false);
            if (!result.ok) return setError(result.message);
            router.refresh();
          })
        }
      >
        <p>Torna aperta nella fase &ldquo;{STAGE_LABELS[fase]}&rdquo;. Motivo e nota della perdita vengono tolti (restano nello storico).</p>
      </ConfirmDialog>
    </>
  );
}

// "Fase" menu of an opportunity outside the pipeline (block 1a-7, A3): on
// the party page and on the stage badge of the party list. The same actions
// and rules as the pipeline: move (handoff stages locked), close as lost
// with its reason, reopen. The badge is the menu button.
export function StageMenu({
  opportunityId,
  fase,
  esito,
  subject,
  showLink = true,
  actions,
}: {
  opportunityId: string;
  fase: Stage;
  esito: Outcome;
  // Party and car park, for labels and dialog titles.
  subject: string;
  showLink?: boolean;
  // For previews and end-to-end tests only.
  actions?: { move: typeof moveStage; closeLost: typeof closeLost };
}) {
  const badge = opportunityBadge(fase, esito);
  return (
    <details className="group inline-block">
      <summary
        className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-xs [&::-webkit-details-marker]:hidden"
        aria-label={`Fase di ${subject}: ${badge.label}. Apri il menu Fase`}
      >
        <Badge tone={badge.tone}>{badge.label}</Badge>
        <span aria-hidden="true" className="text-caption text-black-60 group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="mt-2 flex min-w-56 flex-col gap-2 rounded-sm border border-grey-60 bg-white p-3 shadow-sm">
        {esito === "aperta" ? (
          <>
            <MoveToMenu opportunityId={opportunityId} fase={fase} label={subject} action={actions?.move} />
            <CloseLostButton opportunityId={opportunityId} subject={subject} action={actions?.closeLost} />
          </>
        ) : (
          <>
            <p className="text-caption text-black-80">
              {esito === "persa" ? "Chiusa come persa" : "Chiusa come vinta"}, ultima fase &ldquo;{STAGE_LABELS[fase]}&rdquo;.
            </p>
            <ReopenButton opportunityId={opportunityId} fase={fase} />
          </>
        )}
        {showLink && (
          <Link href={`/opportunita/${opportunityId}`} className="rounded-xs text-caption font-semibold text-blue-ink underline underline-offset-2">
            Apri l&apos;opportunità
          </Link>
        )}
      </div>
    </details>
  );
}

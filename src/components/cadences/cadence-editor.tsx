"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteStep,
  duplicateCadence,
  moveStep,
  saveStep,
  setCadenceArchived,
  updateCadence,
} from "@/app/(app)/cadenze/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { STEP_TYPES, STEP_TYPE_LABELS, waitLabel, type StepType } from "@/lib/cadences/schedule";
import type { Cadence, CadenceStep } from "@/lib/cadences/queries";
import { safeCall } from "@/lib/import/safe-call";

type TemplateOption = { famigliaId: string; nome: string };
type Outcome = { ok: true; data: unknown } | { ok: false; message: string };

// Editor of a cadence (B2): name and description, steps (add, edit, move,
// delete), duplicate and archive. Changes to future steps apply to every
// enrollment; steps already used are read-only.
export function CadenceEditor({ cadence, templates }: { cadence: Cadence; templates: TemplateOption[] }) {
  const router = useRouter();
  const [nome, setNome] = useState(cadence.nome);
  const [descrizione, setDescrizione] = useState(cadence.descrizione ?? "");
  const [message, setMessage] = useState<{ tone: "success" | "critical"; text: string } | null>(null);
  const [editing, setEditing] = useState<string | "nuovo" | null>(cadence.steps.length === 0 ? "nuovo" : null);
  const [pending, startTransition] = useTransition();
  const enrolled = cadence.stats.attivi + cadence.stats.inPausa;

  function run(task: () => Promise<Outcome>, success?: string, after?: (data: unknown) => void) {
    setMessage(null);
    startTransition(async () => {
      const result = await safeCall(task as () => Promise<{ ok: true; data: unknown } | { ok: false; message: string }>);
      if (!result.ok) return setMessage({ tone: "critical", text: result.message });
      if (success) setMessage({ tone: "success", text: success });
      after?.(result.data);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="dati-titolo" className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="dati-titolo" className="text-h4 font-semibold">
            Cadenza
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => duplicateCadence(cadence.id), undefined, (data) => router.push(`/cadenze/${(data as { id: string }).id}`))}
            >
              Duplica
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => setCadenceArchived(cadence.id, !cadence.archiviata), cadence.archiviata ? "Cadenza ripristinata." : "Cadenza archiviata: non si possono iscrivere altri.")}
            >
              {cadence.archiviata ? "Ripristina" : "Archivia"}
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_2fr]">
          <Field id="cadenza-nome" label="Nome" required>
            <Input id="cadenza-nome" value={nome} maxLength={120} onChange={(event) => setNome(event.target.value)} />
          </Field>
          <Field id="cadenza-descrizione" label="Descrizione">
            <Textarea id="cadenza-descrizione" rows={2} maxLength={1000} value={descrizione} onChange={(event) => setDescrizione(event.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="md" disabled={pending} onClick={() => run(() => updateCadence({ id: cadence.id, nome, descrizione }), "Cadenza salvata.")}>
            Salva nome e descrizione
          </Button>
        </div>
      </section>

      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <section aria-labelledby="passi-titolo" className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
        <h2 id="passi-titolo" className="text-h4 font-semibold">
          Passi
        </h2>
        {enrolled > 0 && (
          <Alert tone="warning" className="mt-3">
            {enrolled === 1 ? "1 iscritto" : `${enrolled} iscritti`} in corso: le modifiche ai passi futuri valgono anche per loro. I passi già
            usati non si modificano.
          </Alert>
        )}
        <ol className="mt-4 flex flex-col gap-3">
          {cadence.steps.map((step, index) => (
            <li key={step.id} className="rounded-sm border border-grey-60 p-3">
              {editing === step.id ? (
                <StepForm
                  step={step}
                  templates={templates}
                  pending={pending}
                  onCancel={() => setEditing(null)}
                  onSave={(input) => run(() => saveStep({ ...input, cadenceId: cadence.id, stepId: step.id }), "Passo salvato.", () => setEditing(null))}
                />
              ) : (
                <StepRow
                  step={step}
                  index={index}
                  last={index === cadence.steps.length - 1}
                  previousUsed={index > 0 && cadence.steps[index - 1].usato}
                  template={templates.find((item) => item.famigliaId === step.templateFamigliaId)?.nome ?? null}
                  pending={pending}
                  onEdit={() => setEditing(step.id)}
                  onMove={(direction) => run(() => moveStep(cadence.id, step.id, direction))}
                  onDelete={() => run(() => deleteStep(cadence.id, step.id), "Passo eliminato.")}
                />
              )}
            </li>
          ))}
        </ol>
        <div className="mt-4">
          {editing === "nuovo" ? (
            <div className="rounded-sm border border-brand-blue p-3">
              <StepForm
                step={null}
                templates={templates}
                pending={pending}
                onCancel={() => setEditing(null)}
                onSave={(input) => run(() => saveStep({ ...input, cadenceId: cadence.id }), "Passo aggiunto.", () => setEditing(null))}
              />
            </div>
          ) : (
            <Button variant="primary" size="md" onClick={() => setEditing("nuovo")}>
              Aggiungi passo
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

function StepRow({
  step,
  index,
  last,
  previousUsed,
  template,
  pending,
  onEdit,
  onMove,
  onDelete,
}: {
  step: CadenceStep;
  index: number;
  last: boolean;
  previousUsed: boolean;
  template: string | null;
  pending: boolean;
  onEdit: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">
            Passo {step.posizione}: {STEP_TYPE_LABELS[step.tipo]}
          </span>
          <span className="text-caption text-black-80">
            {index === 0 ? (step.attesaGiorni === 0 ? "il giorno di avvio" : `${waitLabel(step.attesaGiorni)} dall'avvio`) : `${waitLabel(step.attesaGiorni)} dal passo precedente`}
            {step.orario ? `, ore ${step.orario}` : ", ore 09:00"}
          </span>
          {step.usato && <Badge tone="neutral">Già usato: sola lettura</Badge>}
        </p>
        {template && <p className="text-caption text-black-80">Template: {template}</p>}
        {step.istruzioni && <p className="text-caption break-words text-black-60">{step.istruzioni}</p>}
      </div>
      {!step.usato && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending || index === 0 || previousUsed} onClick={() => onMove(-1)}>
            Su<span className="sr-only"> il passo {step.posizione}</span>
          </Button>
          <Button size="sm" disabled={pending || last} onClick={() => onMove(1)}>
            Giù<span className="sr-only"> il passo {step.posizione}</span>
          </Button>
          <Button size="sm" disabled={pending} onClick={onEdit}>
            Modifica<span className="sr-only"> il passo {step.posizione}</span>
          </Button>
          <Button size="sm" variant="ghost" className="text-error-ink" disabled={pending} onClick={() => setConfirm(true)}>
            Elimina<span className="sr-only"> il passo {step.posizione}</span>
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        title={`Eliminare il passo ${step.posizione}?`}
        confirmLabel="Elimina il passo"
        confirmVariant="destructive"
        pending={pending}
        onConfirm={() => {
          setConfirm(false);
          onDelete();
        }}
        onCancel={() => setConfirm(false)}
      >
        <p>I passi successivi salgono di una posizione.</p>
      </ConfirmDialog>
    </div>
  );
}

function StepForm({
  step,
  templates,
  pending,
  onSave,
  onCancel,
}: {
  step: CadenceStep | null;
  templates: TemplateOption[];
  pending: boolean;
  onSave: (input: { tipo: string; attesaGiorni: number; orario: string; templateFamigliaId: string; istruzioni: string }) => void;
  onCancel: () => void;
}) {
  const [tipo, setTipo] = useState<StepType>(step?.tipo ?? "chiamata");
  const [attesa, setAttesa] = useState(String(step?.attesaGiorni ?? 0));
  const [orario, setOrario] = useState(step?.orario ?? "09:00");
  const [template, setTemplate] = useState(step?.templateFamigliaId ?? "");
  const [istruzioni, setIstruzioni] = useState(step?.istruzioni ?? "");
  const [error, setError] = useState<string | null>(null);
  const prefix = step?.id ?? "nuovo";

  function submit() {
    const days = Number(attesa);
    if (!Number.isInteger(days) || days < 0 || days > 60) return setError("L'attesa va da 0 a 60 giorni lavorativi.");
    if (tipo === "email" && !template) return setError("Scegli il template dell'email.");
    setError(null);
    onSave({ tipo, attesaGiorni: days, orario, templateFamigliaId: template, istruzioni });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field id={`${prefix}-tipo`} label="Tipo">
          <Select id={`${prefix}-tipo`} value={tipo} onChange={(event) => setTipo(event.target.value as StepType)}>
            {STEP_TYPES.map((type) => (
              <option key={type} value={type}>
                {STEP_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${prefix}-attesa`} label="Attesa (giorni lav.)" hint="Dal passo precedente; lun-ven.">
          <Input id={`${prefix}-attesa`} type="number" min={0} max={60} value={attesa} onChange={(event) => setAttesa(event.target.value)} hasDescription />
        </Field>
        <Field id={`${prefix}-orario`} label="Orario suggerito">
          <Input id={`${prefix}-orario`} type="time" step={900} value={orario} onChange={(event) => setOrario(event.target.value)} />
        </Field>
        {tipo === "email" && (
          <Field id={`${prefix}-template`} label="Template" required>
            <Select id={`${prefix}-template`} value={template} onChange={(event) => setTemplate(event.target.value)}>
              <option value="">Scegli…</option>
              {templates.map((item) => (
                <option key={item.famigliaId} value={item.famigliaId}>
                  {item.nome}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <Field id={`${prefix}-istruzioni`} label="Istruzioni" hint="Facoltative: cosa dire o fare in questo passo.">
        <Textarea id={`${prefix}-istruzioni`} rows={2} maxLength={1000} value={istruzioni} onChange={(event) => setIstruzioni(event.target.value)} hasDescription />
      </Field>
      {error && <Alert tone="critical">{error}</Alert>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button size="md" variant="ghost" disabled={pending} onClick={onCancel}>
          Annulla
        </Button>
        <Button size="md" disabled={pending} onClick={submit}>
          {step ? "Salva il passo" : "Aggiungi il passo"}
        </Button>
      </div>
    </div>
  );
}

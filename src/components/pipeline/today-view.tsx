"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { stopCadence } from "@/app/(app)/cadenze/actions";
import { completeTask, postponeTask } from "@/app/(app)/pipeline/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { safeCall } from "@/lib/import/safe-call";
import { addDays, romeDay } from "@/lib/pipeline/dates";
import { ACTIVITY_LABELS, CALL_OUTCOMES, CALL_OUTCOME_LABELS, STAGE_LABELS, type CallOutcome } from "@/lib/pipeline/labels";
import type { PipelineItem, TodayTask } from "@/lib/pipeline/queries";
import type { TodayGroups } from "@/lib/pipeline/today";
import { ActivityButton } from "./activity-dialog";
import { formatWhen } from "./next-activity";

type Actions = { complete: typeof completeTask; postpone: typeof postponeTask; stopCadence?: typeof stopCadence };

// A cadence email step to open in "Prepara email" (block 1a-8, B5).
export type CadenceEmailItem = { taskId: string; href: string; party: string; titolo: string; scadenza: string | null };

// "Oggi" (CRM-19): the user's reminders, overdue, today and next 7 days,
// and the open opportunities without a next activity.
export function TodayView({
  groups,
  withoutNext,
  now,
  emailSteps = [],
  actions = { complete: completeTask, postpone: postponeTask },
}: {
  groups: TodayGroups<TodayTask>;
  withoutNext: PipelineItem[];
  now: number;
  // Cadence email steps of the user, by task: due ones first in their own
  // section, all of them open "Prepara email" instead of "Fatta".
  emailSteps?: (CadenceEmailItem & { due: boolean })[];
  // For previews and end-to-end tests only.
  actions?: Actions;
}) {
  const [done, setDone] = useState<TodayTask | null>(null);
  const [later, setLater] = useState<TodayTask | null>(null);
  const empty = groups.scadute.length + groups.oggi.length + groups.settimana.length === 0;
  const stepHrefs = Object.fromEntries(emailSteps.map((step) => [step.taskId, step.href]));
  const dueEmails = emailSteps.filter((step) => step.due);

  return (
    <div className="flex flex-col gap-6">
      {empty && withoutNext.length === 0 && (
        <Alert tone="success" title="Niente in sospeso">
          Nessuna attività in scadenza nei prossimi 7 giorni e ogni opportunità ha la sua prossima attività.
        </Alert>
      )}
      {dueEmails.length > 0 && (
        <section aria-labelledby="email-cadenza" className="rounded-md border border-brand-blue bg-white p-5 shadow-sm sm:p-6">
          <h2 id="email-cadenza" className="flex flex-wrap items-center gap-2 text-h4 font-semibold">
            Email della cadenza da inviare <Badge tone="info">{dueEmails.length}</Badge>
          </h2>
          <p className="mt-1 text-caption text-black-60">
            Una alla volta: Apri in Gmail, Segna come inviata, poi la successiva. Niente parte da solo.
          </p>
          <ol className="mt-3 divide-y divide-grey-60">
            {dueEmails.map((step, index) => (
              <li key={step.taskId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <span className="font-semibold">{step.party}</span>
                  <span className="block text-caption text-black-80">
                    {step.titolo}
                    {step.scadenza && ` · ${formatWhen(step.scadenza)}`}
                  </span>
                </span>
                <ButtonLink href={step.href} variant={index === 0 ? "primary" : "secondary"}>
                  {index === 0 ? "Apri la prima" : "Apri"}
                  <span className="sr-only"> email per {step.party}</span>
                </ButtonLink>
              </li>
            ))}
          </ol>
        </section>
      )}
      <Group id="scadute" title="Scadute" tasks={groups.scadute} now={now} onDone={setDone} onLater={setLater} stepHrefs={stepHrefs} />
      <Group id="oggi" title="Oggi" tasks={groups.oggi} now={now} onDone={setDone} onLater={setLater} stepHrefs={stepHrefs} />
      <Group id="settimana" title="Prossimi 7 giorni" tasks={groups.settimana} now={now} onDone={setDone} onLater={setLater} stepHrefs={stepHrefs} />

      {withoutNext.length > 0 && (
        <section aria-labelledby="senza-prossima" className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
          <h2 id="senza-prossima" className="flex flex-wrap items-center gap-2 text-h4 font-semibold">
            Opportunità senza prossima attività <Badge tone="attention">{withoutNext.length}</Badge>
          </h2>
          <p className="mt-1 text-caption text-black-60">Ogni opportunità aperta dovrebbe avere una prossima attività con data.</p>
          <ul className="mt-3 divide-y divide-grey-60">
            {withoutNext.map((item) => (
              <li key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  <Link href={`/opportunita/${item.id}`} className="rounded-xs font-semibold text-blue-ink underline-offset-2 hover:underline">
                    {item.party}
                  </Link>
                  <span className="block text-caption text-black-80">
                    {item.parking} · {STAGE_LABELS[item.fase]}
                  </span>
                </span>
                <ActivityButton opportunityId={item.id} partyId={item.partyId} subject={`${item.party} · ${item.parking}`} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <DoneDialog task={done} onClose={() => setDone(null)} action={actions.complete} stop={actions.stopCadence ?? stopCadence} />
      <LaterDialog task={later} onClose={() => setLater(null)} action={actions.postpone} />
    </div>
  );
}

function Group({
  id,
  title,
  tasks,
  now,
  onDone,
  onLater,
  stepHrefs,
}: {
  id: string;
  title: string;
  tasks: TodayTask[];
  now: number;
  onDone: (task: TodayTask) => void;
  onLater: (task: TodayTask) => void;
  stepHrefs: Record<string, string>;
}) {
  return (
    <section aria-labelledby={`gruppo-${id}`} className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
      <h2 id={`gruppo-${id}`} className="flex flex-wrap items-center gap-2 text-h4 font-semibold">
        {title}
        <Badge tone={id === "scadute" && tasks.length > 0 ? "critical" : "neutral"}>{tasks.length}</Badge>
      </h2>
      {tasks.length === 0 ? (
        <p className="mt-2 text-body text-black-60">Niente.</p>
      ) : (
        <ul className="mt-3 divide-y divide-grey-60">
          {tasks.map((task) => {
            const late = task.scadenza !== null && Date.parse(task.scadenza) < now;
            return (
              <li key={task.id} className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{task.cadenceEnrollmentId && task.tipo === "nota" ? "Attività" : ACTIVITY_LABELS[task.tipo]}</span>
                    <span className="text-black-80">·</span>
                    {task.opportunityId ? (
                      <Link href={`/opportunita/${task.opportunityId}`} className="rounded-xs font-semibold text-blue-ink underline-offset-2 hover:underline">
                        {task.party}
                      </Link>
                    ) : (
                      <span className="font-semibold">{task.party}</span>
                    )}
                    {late && <Badge tone="critical">{id === "scadute" ? "Scaduta" : "In ritardo"}</Badge>}
                  </p>
                  <p className="text-caption text-black-80">
                    {task.scadenza ? formatWhen(task.scadenza) : "Senza data"}
                    {task.parking && ` · ${task.parking}`}
                    {task.fase && ` · ${STAGE_LABELS[task.fase]}`}
                  </p>
                  {task.cadenceEnrollmentId && <p className="text-caption font-semibold text-blue-ink">{task.titolo}</p>}
                  {task.nota && <p className="text-caption text-black-60 break-words">{task.nota}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {stepHrefs[task.id] ? (
                    <ButtonLink href={stepHrefs[task.id]}>
                      Prepara email<span className="sr-only"> per {task.party}</span>
                    </ButtonLink>
                  ) : (
                    <Button onClick={() => onDone(task)}>Fatta</Button>
                  )}
                  <Button onClick={() => onLater(task)}>Rimanda</Button>
                  {task.partyId && (
                    <Link
                      href={`/soggetti/${task.partyId}`}
                      className="inline-flex min-h-(--control-h) items-center rounded-sm px-3 text-[14px] font-semibold text-brand-blue underline-offset-2 hover:underline md:min-h-(--control-h-sm)"
                    >
                      Apri soggetto
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// "Fatta": the reminder becomes an activity; a call needs its outcome.
function DoneDialog({
  task,
  onClose,
  action,
  stop,
}: {
  task: TodayTask | null;
  onClose: () => void;
  action: typeof completeTask;
  stop: typeof stopCadence;
}) {
  const router = useRouter();
  const [testo, setTesto] = useState("");
  const [giorno, setGiorno] = useState("");
  const [ora, setOra] = useState("09:00");
  const [error, setError] = useState<string | null>(null);
  const [askStop, setAskStop] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isCall = task?.tipo === "chiamata";

  function close() {
    setTesto("");
    setGiorno("");
    setError(null);
    setAskStop(null);
    onClose();
  }

  // "Risposto" on a cadence step: stop the cadence? (counts as "risposto")
  function stopNow() {
    if (!askStop) return;
    startTransition(async () => {
      const result = await safeCall(() => stop(askStop, "risposto", "Ha risposto alla chiamata"));
      if (!result.ok) return setError(result.message);
      router.refresh();
      close();
    });
  }

  function save(esito: CallOutcome | null) {
    if (!task) return;
    setError(null);
    if (esito === "richiamare" && !giorno) return setError("Con \"Richiamare\" indica quando richiamare.");
    startTransition(async () => {
      const result = await safeCall(() => action({ taskId: task.id, esito, testo, prossimaGiorno: giorno, prossimaOra: ora }));
      if (!result.ok) return setError(result.message);
      router.refresh();
      if (esito === "risposto" && task.cadenceEnrollmentId) return setAskStop(task.cadenceEnrollmentId);
      close();
    });
  }

  if (askStop) {
    return (
      <Dialog
        open
        title="Fermare la cadenza?"
        busy={pending}
        onClose={close}
        footer={
          <>
            <Button size="md" disabled={pending} onClick={close}>
              No, continua
            </Button>
            <Button variant="primary" size="md" disabled={pending} onClick={stopNow}>
              Sì, ferma la cadenza
            </Button>
          </>
        }
      >
        <p className="text-body">Ha risposto: se la fermi conta come &ldquo;risposto&rdquo; nelle statistiche. Altrimenti il prossimo passo è già in Oggi.</p>
        {error && <Alert tone="critical">{error}</Alert>}
      </Dialog>
    );
  }

  return (
    <Dialog
      open={task !== null}
      title={task ? `${ACTIVITY_LABELS[task.tipo]} fatta: ${task.party}` : ""}
      busy={pending}
      onClose={close}
      footer={
        <>
          <Button size="md" disabled={pending} onClick={close}>
            Annulla
          </Button>
          {!isCall && (
            <Button variant="primary" size="md" disabled={pending} onClick={() => save(null)}>
              Segna come fatta
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field id="fatta-nota" label="Nota" hint="Facoltativa.">
          <Textarea id="fatta-nota" rows={2} value={testo} onChange={(event) => setTesto(event.target.value)} hasDescription />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="fatta-giorno" label="Prossima attività: giorno" hint="Facoltativa; obbligatoria con Richiamare.">
            <Input id="fatta-giorno" type="date" value={giorno} min={romeDay(new Date())} onChange={(event) => setGiorno(event.target.value)} hasDescription />
          </Field>
          <Field id="fatta-ora" label="Ora">
            <Input id="fatta-ora" type="time" value={ora} step={900} onChange={(event) => setOra(event.target.value)} />
          </Field>
        </div>
        {error && <Alert tone="critical">{error}</Alert>}
        {isCall && (
          <div>
            <p className="text-label font-semibold tracking-[0.08em] text-black-80 uppercase">Esito: scegli per salvare</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CALL_OUTCOMES.map((outcome) => (
                <Button key={outcome} size="md" variant={outcome === "risposto" ? "primary" : "secondary"} disabled={pending} onClick={() => save(outcome)}>
                  {CALL_OUTCOME_LABELS[outcome]}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

// "Rimanda": a new date, with quick choices.
function LaterDialog({ task, onClose, action }: { task: TodayTask | null; onClose: () => void; action: typeof postponeTask }) {
  const router = useRouter();
  const today = romeDay(new Date());
  const [giorno, setGiorno] = useState(addDays(today, 1));
  const [ora, setOra] = useState("09:00");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(day: string) {
    if (!task) return;
    setError(null);
    startTransition(async () => {
      const result = await safeCall(() => action({ taskId: task.id, giorno: day, ora }));
      if (!result.ok) return setError(result.message);
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog
      open={task !== null}
      title={task ? `Rimanda: ${task.party}` : ""}
      busy={pending}
      onClose={onClose}
      footer={
        <>
          <Button size="md" disabled={pending} onClick={onClose}>
            Annulla
          </Button>
          <Button variant="primary" size="md" disabled={pending || !giorno} onClick={() => save(giorno)}>
            Rimanda
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {[
            ["Domani", 1],
            ["Tra 3 giorni", 3],
            ["Tra una settimana", 7],
          ].map(([label, days]) => (
            <Button key={label} disabled={pending} onClick={() => save(addDays(today, Number(days)))}>
              {label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="rimanda-giorno" label="Altro giorno">
            <Input id="rimanda-giorno" type="date" value={giorno} min={today} onChange={(event) => setGiorno(event.target.value)} />
          </Field>
          <Field id="rimanda-ora" label="Ora">
            <Input id="rimanda-ora" type="time" value={ora} step={900} onChange={(event) => setOra(event.target.value)} />
          </Field>
        </div>
        {error && <Alert tone="critical">{error}</Alert>}
      </div>
    </Dialog>
  );
}

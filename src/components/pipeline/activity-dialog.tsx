"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { logActivity, moveStage } from "@/app/(app)/pipeline/actions";
import { Alert } from "@/components/ui/alert";
import { Button, type ButtonSize } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { safeCall } from "@/lib/import/safe-call";
import { addDays, romeDay } from "@/lib/pipeline/dates";
import { ACTIVITY_LABELS, ACTIVITY_TYPES, CALL_OUTCOMES, CALL_OUTCOME_LABELS, type ActivityKind, type CallOutcome } from "@/lib/pipeline/labels";

type Actions = { log: typeof logActivity; move: typeof moveStage };

// "Registra chiamata" (CRM-18) in 2 clicks: open, then one of the outcomes,
// which saves. The next activity is prefilled for tomorrow at 9:00: used by
// "Richiamare" (where it is required) and, when ticked, by the others.
// Other kinds (email, meeting, note) are chosen in the same dialog.
export function ActivityButton({
  opportunityId,
  partyId,
  subject,
  size = "sm",
  variant = "secondary",
  label = "Registra chiamata",
  initiallyOpen = false,
  actions = { log: logActivity, move: moveStage },
}: {
  opportunityId: string | null;
  partyId: string | null;
  // Shown in the title: party, and car park when on an opportunity.
  subject: string;
  size?: ButtonSize;
  variant?: "primary" | "secondary" | "ghost";
  label?: string;
  // For previews and end-to-end tests only.
  initiallyOpen?: boolean;
  actions?: Actions;
}) {
  const router = useRouter();
  const tomorrow = addDays(romeDay(new Date()), 1);
  const [open, setOpen] = useState(initiallyOpen);
  const [tipo, setTipo] = useState<ActivityKind>("chiamata");
  const [testo, setTesto] = useState("");
  const [planNext, setPlanNext] = useState(false);
  const [giorno, setGiorno] = useState(tomorrow);
  const [ora, setOra] = useState("09:00");
  const [prossimaTipo, setProssimaTipo] = useState<ActivityKind>("chiamata");
  const [error, setError] = useState<string | null>(null);
  const [propose, setPropose] = useState(false);
  const [pending, startTransition] = useTransition();

  function reset() {
    setTipo("chiamata");
    setTesto("");
    setPlanNext(false);
    setGiorno(addDays(romeDay(new Date()), 1));
    setOra("09:00");
    setProssimaTipo("chiamata");
    setError(null);
    setPropose(false);
  }

  function save(esito: CallOutcome | null) {
    setError(null);
    const withNext = esito === "richiamare" || planNext;
    if (esito === "richiamare" && !giorno) return setError('Con "Richiamare" indica quando richiamare.');
    startTransition(async () => {
      const result = await safeCall(() =>
        actions.log({
          opportunityId,
          partyId,
          tipo,
          esito,
          testo,
          prossimaGiorno: withNext ? giorno : "",
          prossimaOra: withNext ? ora : "",
          prossimaTipo: esito === "richiamare" ? "chiamata" : prossimaTipo,
        }),
      );
      if (!result.ok) return setError(result.message);
      router.refresh();
      if (result.data.proponiContattata && opportunityId) {
        setPropose(true);
        return;
      }
      setOpen(false);
      reset();
    });
  }

  function toContacted() {
    if (!opportunityId) return;
    startTransition(async () => {
      const result = await safeCall(() => actions.move(opportunityId, "contattata"));
      if (!result.ok) return setError(result.message);
      router.refresh();
      setOpen(false);
      reset();
    });
  }

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog
        open={open}
        title={propose ? "Chiamata registrata" : `${tipo === "chiamata" ? "Chiamata" : "Attività"}: ${subject}`}
        busy={pending}
        onClose={() => {
          setOpen(false);
          reset();
        }}
        footer={
          propose ? (
            <>
              <Button
                size="md"
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Lascia la fase com&apos;è
              </Button>
              <Button variant="primary" size="md" disabled={pending} onClick={toContacted}>
                Passa a Contattata
              </Button>
            </>
          ) : (
            // The outcomes stay in the footer, always in view: on a phone
            // too the call is saved with the second click.
            <div className="flex w-full flex-col gap-3">
              {error && <Alert tone="critical">{error}</Alert>}
              {tipo === "chiamata" && (
                <div role="group" aria-labelledby="esito-titolo">
                  <p id="esito-titolo" className="text-label font-semibold tracking-[0.08em] text-black-80 uppercase">
                    Esito: scegli per salvare
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {CALL_OUTCOMES.map((outcome) => (
                      <Button
                        key={outcome}
                        size="md"
                        variant={outcome === "risposto" ? "primary" : "secondary"}
                        disabled={pending}
                        onClick={() => save(outcome)}
                      >
                        {CALL_OUTCOME_LABELS[outcome]}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  size={tipo === "chiamata" ? "sm" : "md"}
                  variant={tipo === "chiamata" ? "ghost" : "secondary"}
                  disabled={pending}
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                >
                  Annulla
                </Button>
                {tipo !== "chiamata" && (
                  <Button variant="primary" size="md" disabled={pending} onClick={() => save(null)}>
                    Salva {ACTIVITY_LABELS[tipo].toLowerCase()}
                  </Button>
                )}
              </div>
            </div>
          )
        }
      >
        {propose ? (
          <p className="text-body">
            È la prima chiamata con risposta su questa opportunità, che è ancora tra le prime fasi. Vuoi passarla a &ldquo;Contattata&rdquo;?
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
              <Field id="attivita-tipo" label="Tipo">
                <Select id="attivita-tipo" value={tipo} onChange={(event) => setTipo(event.target.value as ActivityKind)}>
                  {ACTIVITY_TYPES.map((kind) => (
                    <option key={kind} value={kind}>
                      {ACTIVITY_LABELS[kind]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="attivita-nota" label="Nota" hint="Facoltativa.">
                <Textarea
                  id="attivita-nota"
                  rows={2}
                  maxLength={4000}
                  value={testo}
                  onChange={(event) => setTesto(event.target.value)}
                  hasDescription
                />
              </Field>
            </div>

            <fieldset className="rounded-sm border border-grey-60 p-3">
              <legend className="px-1 text-label font-semibold tracking-[0.08em] text-black-80 uppercase">Prossima attività</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field id="prossima-giorno" label="Giorno">
                  <Input
                    id="prossima-giorno"
                    type="date"
                    value={giorno}
                    min={romeDay(new Date())}
                    onChange={(event) => setGiorno(event.target.value)}
                  />
                </Field>
                <Field id="prossima-ora" label="Ora">
                  <Input id="prossima-ora" type="time" value={ora} step={900} onChange={(event) => setOra(event.target.value)} />
                </Field>
                <div className="col-span-2 sm:col-span-1">
                  <Field id="prossima-tipo" label="Tipo">
                    <Select id="prossima-tipo" value={prossimaTipo} onChange={(event) => setProssimaTipo(event.target.value as ActivityKind)}>
                      {ACTIVITY_TYPES.filter((kind) => kind !== "nota").map((kind) => (
                        <option key={kind} value={kind}>
                          {ACTIVITY_LABELS[kind]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
              <Checkbox
                className="mt-3"
                checked={planNext}
                onChange={(event) => setPlanNext(event.target.checked)}
                label="Pianifica la prossima attività"
                hint="Con &ldquo;Richiamare&rdquo; si pianifica sempre, alla data indicata."
              />
            </fieldset>
          </div>
        )}
      </Dialog>
    </>
  );
}

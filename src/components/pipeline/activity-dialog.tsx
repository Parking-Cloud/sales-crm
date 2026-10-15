"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { listCallRecipients, type CallRecipient } from "@/app/(app)/email/actions";
import { stopCadence } from "@/app/(app)/cadenze/actions";
import { logActivity, moveStage, type ActivityResult } from "@/app/(app)/pipeline/actions";
import { Alert } from "@/components/ui/alert";
import { Button, type ButtonSize } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { safeCall } from "@/lib/import/safe-call";
import { addDays, romeDay } from "@/lib/pipeline/dates";
import { ACTIVITY_LABELS, ACTIVITY_TYPES, CALL_OUTCOMES, CALL_OUTCOME_LABELS, type ActivityKind, type CallOutcome } from "@/lib/pipeline/labels";

type Actions = { log: typeof logActivity; move: typeof moveStage; recipients?: typeof listCallRecipients; stopCadence?: typeof stopCadence };

const GENERAL = "generale";

// "Registra chiamata" (CRM-18) in 2 clicks: open, then one of the outcomes,
// which saves. The next activity is prefilled for tomorrow at 9:00: used by
// "Richiamare" (where it is required) and, when ticked, by the others.
// Other kinds (email, meeting, note) are chosen in the same dialog.
// With "Risposto", "Ha chiesto di ricevere l'email" also registers the email
// permission (block 1a-7, B4) and proposes to prepare the email right away.
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
  const [after, setAfter] = useState<ActivityResult | null>(null);
  const [alsoContacted, setAlsoContacted] = useState(true);
  const [askedEmail, setAskedEmail] = useState(false);
  const [recipients, setRecipients] = useState<CallRecipient[] | null>(null);
  const [recipientKey, setRecipientKey] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const loadRecipients = actions.recipients ?? listCallRecipients;
  const recipient = recipients?.find((item) => (item.id ?? GENERAL) === recipientKey) ?? null;

  function reset() {
    setTipo("chiamata");
    setTesto("");
    setPlanNext(false);
    setGiorno(addDays(romeDay(new Date()), 1));
    setOra("09:00");
    setProssimaTipo("chiamata");
    setError(null);
    setAfter(null);
    setAlsoContacted(true);
    setAskedEmail(false);
    setRecipients(null);
    setRecipientKey("");
    setRecipientEmail("");
  }

  function close() {
    setOpen(false);
    reset();
  }

  function toggleAskedEmail(checked: boolean) {
    setAskedEmail(checked);
    if (!checked || recipients) return;
    startTransition(async () => {
      const result = await safeCall(() => loadRecipients({ partyId, opportunityId }));
      if (!result.ok) return setError(result.message);
      const list = result.data.recipients.filter((item) => item.disponibile);
      setRecipients(list);
      const preferred =
        list.find((item) => item.id === result.data.contactId) ?? list.find((item) => item.id !== null && item.email) ?? list.find((item) => item.id !== null) ?? list[0];
      setRecipientKey(preferred ? (preferred.id ?? GENERAL) : "");
    });
  }

  function save(esito: CallOutcome | null) {
    setError(null);
    const withNext = esito === "richiamare" || planNext;
    if (esito === "richiamare" && !giorno) return setError('Con "Richiamare" indica quando richiamare.');
    const permesso = esito === "risposto" && askedEmail ? recipient : null;
    if (esito === "risposto" && askedEmail) {
      if (!permesso) return setError("Scegli a chi mandare l'email.");
      if (!permesso.email && !recipientEmail.trim()) return setError("Scrivi l'indirizzo email che ti ha dato.");
    }
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
          permesso: permesso ? { contactId: permesso.id, email: permesso.email ? "" : recipientEmail.trim() } : null,
        }),
      );
      if (!result.ok) return setError(result.message);
      router.refresh();
      if ((result.data.proponiContattata && opportunityId) || result.data.permesso || result.data.cadenza) {
        setAfter(result.data);
        return;
      }
      close();
    });
  }

  // After the call: optionally "Contattata", then close or prepare the email.
  function finish(move: boolean, then?: string) {
    startTransition(async () => {
      if (move && opportunityId) {
        const result = await safeCall(() => actions.move(opportunityId, "contattata"));
        if (!result.ok) return setError(result.message);
      }
      if (then) router.push(then);
      else router.refresh();
      close();
    });
  }

  const contactedQuestion = Boolean(after?.proponiContattata && opportunityId);
  const permissionDone = after?.permesso?.registrato === true;
  const emailHref =
    after?.partyId && after.permesso?.registrato
      ? `/email/prepara?soggetto=${after.partyId}&contatto=${after.permesso.contactId ?? GENERAL}${opportunityId ? `&opportunita=${opportunityId}` : ""}`
      : null;

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog
        open={open}
        title={after ? "Chiamata registrata" : `${tipo === "chiamata" ? "Chiamata" : "Attività"}: ${subject}`}
        busy={pending}
        onClose={close}
        footer={
          after ? (
            permissionDone && emailHref ? (
              <>
                <Button size="md" disabled={pending} onClick={() => finish(contactedQuestion && alsoContacted)}>
                  Chiudi
                </Button>
                <Button variant="primary" size="md" disabled={pending} onClick={() => finish(contactedQuestion && alsoContacted, emailHref)}>
                  Prepara l&apos;email
                </Button>
              </>
            ) : contactedQuestion ? (
              <>
                <Button size="md" disabled={pending} onClick={() => finish(false)}>
                  Lascia la fase com&apos;è
                </Button>
                <Button variant="primary" size="md" disabled={pending} onClick={() => finish(true)}>
                  Passa a Contattata
                </Button>
              </>
            ) : (
              <Button variant="primary" size="md" disabled={pending} onClick={() => finish(false)}>
                Chiudi
              </Button>
            )
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
                <Button size={tipo === "chiamata" ? "sm" : "md"} variant={tipo === "chiamata" ? "ghost" : "secondary"} disabled={pending} onClick={close}>
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
        {after ? (
          <div className="flex flex-col gap-3">
            {after.permesso?.registrato && <Alert tone="success">Permesso email registrato: puoi preparare l&apos;email adesso.</Alert>}
            {after.permesso && !after.permesso.registrato && <Alert tone="warning">{after.permesso.messaggio}</Alert>}
            {contactedQuestion &&
              (permissionDone ? (
                <Checkbox
                  checked={alsoContacted}
                  onChange={(event) => setAlsoContacted(event.target.checked)}
                  label="Passa anche l'opportunità a &ldquo;Contattata&rdquo;"
                  hint="È la prima chiamata con risposta e l'opportunità è ancora tra le prime fasi."
                />
              ) : (
                <p className="text-body">
                  È la prima chiamata con risposta su questa opportunità, che è ancora tra le prime fasi. Vuoi passarla a &ldquo;Contattata&rdquo;?
                </p>
              ))}
            {after.cadenza && (
              <CadenceStopQuestion enrollmentId={after.cadenza.enrollmentId} nome={after.cadenza.nome} stop={actions.stopCadence ?? stopCadence} />
            )}
            {error && <Alert tone="critical">{error}</Alert>}
          </div>
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

            {tipo === "chiamata" && (
              <div className="rounded-sm border border-grey-60 p-3">
                <Checkbox
                  checked={askedEmail}
                  onChange={(event) => toggleAskedEmail(event.target.checked)}
                  label="Ha chiesto di ricevere l'email"
                  hint="Vale con l'esito Risposto: registra il permesso email e propone di preparare l'email."
                />
                {askedEmail && recipients && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {recipients.length === 0 ? (
                      <p className="text-caption text-error-ink sm:col-span-2">Nessun destinatario disponibile: tutti da non contattare.</p>
                    ) : (
                      <Field id="permesso-destinatario" label="A chi">
                        <Select id="permesso-destinatario" value={recipientKey} onChange={(event) => setRecipientKey(event.target.value)}>
                          {recipients.map((item) => (
                            <option key={item.id ?? GENERAL} value={item.id ?? GENERAL}>
                              {item.nome}
                              {item.email ? ` – ${item.email}` : " – senza email"}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}
                    {recipient && !recipient.email && (
                      <Field id="permesso-indirizzo" label="Indirizzo email" required>
                        <Input
                          id="permesso-indirizzo"
                          type="email"
                          inputMode="email"
                          value={recipientEmail}
                          onChange={(event) => setRecipientEmail(event.target.value)}
                        />
                      </Field>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}

// After an answered call on an opportunity in a cadence: "Fermare la
// cadenza?" (counts as "risposto"). Answering no leaves it running.
function CadenceStopQuestion({ enrollmentId, nome, stop }: { enrollmentId: string; nome: string; stop: typeof stopCadence }) {
  const router = useRouter();
  const [state, setState] = useState<"ask" | "stopped" | "kept">("ask");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (state === "stopped") return <Alert tone="success">Cadenza &ldquo;{nome}&rdquo; fermata: conta come &ldquo;risposto&rdquo;.</Alert>;
  if (state === "kept") return <p className="text-caption text-black-80">La cadenza &ldquo;{nome}&rdquo; continua.</p>;
  return (
    <div className="rounded-sm border border-grey-60 p-3">
      <p className="text-body font-semibold">Fermare la cadenza &ldquo;{nome}&rdquo;?</p>
      <p className="text-caption text-black-80">Ha risposto: se la fermi conta come &ldquo;risposto&rdquo;.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await safeCall(() => stop(enrollmentId, "risposto", "Ha risposto alla chiamata"));
              if (!result.ok) return setError(result.message);
              setState("stopped");
              router.refresh();
            })
          }
        >
          Sì, ferma la cadenza
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setState("kept")}>
          No, continua
        </Button>
      </div>
      {error && <Alert tone="critical">{error}</Alert>}
    </div>
  );
}

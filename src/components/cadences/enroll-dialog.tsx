"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { enrollInCadence, type EnrollRow } from "@/app/(app)/cadenze/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import { safeCall } from "@/lib/import/safe-call";
import { romeDay } from "@/lib/pipeline/dates";

export type CadenceOption = { id: string; nome: string; passi: number };

// "Iscrivi a cadenza" (B3) for several parties (party list) or
// opportunities (pipeline, opportunity page): cadence, car park (parties
// with several open opportunities), start day. The main contact is proposed
// by the database (the opportunity's, or the first one that can be
// contacted). Summary: enrolled and skipped with the reason.
export function EnrollButton({
  mode,
  cadences,
  parkings = [],
  names,
  formId,
  ids: fixedIds,
  label = "Iscrivi a cadenza",
  size = "sm",
  initiallyOpen = false,
  action = enrollInCadence,
}: {
  mode: "parties" | "opportunities";
  cadences: CadenceOption[];
  parkings?: { id: string; nome: string }[];
  // Names by party or opportunity id, for the summary.
  names: Record<string, string>;
  // The selection form of the list (checkboxes tied to it by form id), or
  // the ids themselves (opportunity page).
  formId?: string;
  ids?: string[];
  label?: string;
  size?: "sm" | "md";
  // For previews and end-to-end tests only.
  initiallyOpen?: boolean;
  action?: typeof enrollInCadence;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  const [ids, setIds] = useState<string[]>([]);
  const [cadenceId, setCadenceId] = useState(cadences[0]?.id ?? "");
  const [parkingId, setParkingId] = useState("");
  const [avvio, setAvvio] = useState(romeDay(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<EnrollRow[] | null>(null);
  const [pending, startTransition] = useTransition();

  function openDialog() {
    const selected =
      fixedIds ??
      [...document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${formId}"]:checked`)].map((box) => box.value).filter(Boolean);
    setIds(selected);
    setSummary(null);
    setError(selected.length === 0 ? (mode === "parties" ? "Seleziona almeno un soggetto nella tabella." : "Seleziona almeno un'opportunità.") : null);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setSummary(null);
    setError(null);
  }

  function submit() {
    if (!cadenceId) return setError("Scegli la cadenza.");
    if (!avvio) return setError("Scegli la data di avvio.");
    setError(null);
    startTransition(async () => {
      const result = await safeCall(() =>
        action(mode === "parties" ? { cadenceId, avvio, partyIds: ids, parkingId: parkingId || null } : { cadenceId, avvio, opportunityIds: ids }),
      );
      if (!result.ok) return setError(result.message);
      setSummary(result.data);
      router.refresh();
    });
  }

  const enrolled = summary?.filter((row) => row.esito === "iscritta") ?? [];
  const skipped = summary?.filter((row) => row.esito === "saltata") ?? [];
  const nameOf = (row: EnrollRow) => names[(mode === "parties" ? row.partyId : row.opportunityId) ?? ""] ?? "Opportunità";

  return (
    <>
      <Button size={size} onClick={openDialog} disabled={cadences.length === 0}>
        {label}
      </Button>
      <Dialog
        open={open}
        title={summary ? "Iscrizione alla cadenza" : `Iscrivi a una cadenza (${ids.length} ${mode === "parties" ? (ids.length === 1 ? "soggetto" : "soggetti") : "opportunità"})`}
        busy={pending}
        onClose={close}
        footer={
          summary ? (
            <Button variant="primary" size="md" onClick={close}>
              Chiudi
            </Button>
          ) : (
            <>
              <Button size="md" disabled={pending} onClick={close}>
                Annulla
              </Button>
              <Button variant="primary" size="md" disabled={pending || ids.length === 0} aria-busy={pending || undefined} onClick={submit}>
                {pending ? "Iscrizione..." : "Iscrivi"}
              </Button>
            </>
          )
        }
      >
        {summary ? (
          <div className="flex flex-col gap-3">
            <p className="text-body">
              <strong>{enrolled.length === 1 ? "1 iscritto" : `${enrolled.length} iscritti`}</strong>,{" "}
              <strong>{skipped.length === 1 ? "1 saltato" : `${skipped.length} saltati`}</strong>.
            </p>
            {skipped.length > 0 && (
              <ul className="flex flex-col gap-1">
                {skipped.map((row, index) => (
                  <li key={`${row.partyId}-${row.opportunityId}-${index}`} className="text-body">
                    <span className="font-semibold">{nameOf(row)}</span>: {row.motivo}
                  </li>
                ))}
              </ul>
            )}
            {enrolled.length > 0 && (
              <p className="text-caption text-black-80">
                Il primo passo è già in{" "}
                <Link href="/oggi" className="font-semibold text-blue-ink underline underline-offset-2">
                  Oggi
                </Link>{" "}
                dei responsabili, alla data calcolata.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Field id="iscrizione-cadenza" label="Cadenza">
              <Select id="iscrizione-cadenza" value={cadenceId} onChange={(event) => setCadenceId(event.target.value)}>
                {cadences.map((cadence) => (
                  <option key={cadence.id} value={cadence.id}>
                    {cadence.nome} ({cadence.passi} passi)
                  </option>
                ))}
              </Select>
            </Field>
            {mode === "parties" && (
              <Field id="iscrizione-parcheggio" label="Parcheggio" hint="Serve per i soggetti con più opportunità aperte.">
                <Select id="iscrizione-parcheggio" value={parkingId} onChange={(event) => setParkingId(event.target.value)} hasDescription>
                  <option value="">L&apos;unica opportunità aperta del soggetto</option>
                  {parkings.map((parking) => (
                    <option key={parking.id} value={parking.id}>
                      {parking.nome}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field id="iscrizione-avvio" label="Data di avvio" hint="Il primo passo cade in questo giorno (o nel primo giorno lavorativo dopo l'attesa).">
              <Input id="iscrizione-avvio" type="date" value={avvio} min={romeDay(new Date())} onChange={(event) => setAvvio(event.target.value)} hasDescription />
            </Field>
            <p className="text-caption text-black-80">
              Contatto principale: quello dell&apos;opportunità o, se manca, il primo che si può contattare. Si saltano soggetti in lista
              di esclusione, opportunità chiuse o già in cadenza, e chi non ha contatti.
            </p>
            {error && <Alert tone="critical">{error}</Alert>}
          </div>
        )}
      </Dialog>
    </>
  );
}

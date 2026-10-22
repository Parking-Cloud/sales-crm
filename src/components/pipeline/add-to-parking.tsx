"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { addToParking, type AddToParkingRow } from "@/app/(app)/pipeline/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/field";
import { safeCall } from "@/lib/import/safe-call";
import type { ParkingChoice, ParkingOption } from "@/lib/pipeline/queries";
import { formatKm } from "@/lib/settings/distance";

function distanceLabel(meters: number | null): string {
  return meters === null ? "distanza non calcolabile" : `${formatKm(meters)} in linea d'aria`;
}

// "Aggiungi a un parcheggio" (block 1a-7, A1): a new opportunity in
// "Individuata", assigned to whoever creates it. A car park where the party
// already has an open opportunity cannot be chosen: its link is shown.
export function AddToParkingButton({
  partyId,
  partyName,
  choices,
  initiallyOpen = false,
  action = addToParking,
}: {
  partyId: string;
  partyName: string;
  choices: ParkingChoice[];
  // For previews and end-to-end tests only.
  initiallyOpen?: boolean;
  action?: typeof addToParking;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initiallyOpen);
  const [parkingId, setParkingId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setParkingId("");
    setError(null);
    setExisting(null);
  }

  function submit() {
    setError(null);
    setExisting(null);
    if (!parkingId) return setError("Scegli un parcheggio.");
    startTransition(async () => {
      const result = await safeCall(() => action({ partyIds: [partyId], parkingId }));
      if (!result.ok) return setError(result.message);
      const row = result.data[0];
      if (row?.esito !== "creata") {
        setExisting(row?.opportunityId ?? null);
        return setError(row?.motivo ?? "Parcheggio non aggiunto.");
      }
      router.refresh();
      close();
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Aggiungi a un parcheggio</Button>
      <Dialog
        open={open}
        title={`Aggiungi a un parcheggio: ${partyName}`}
        busy={pending}
        onClose={close}
        footer={
          <>
            <Button size="md" disabled={pending} onClick={close}>
              Annulla
            </Button>
            <Button variant="primary" size="md" disabled={pending} aria-busy={pending || undefined} onClick={submit}>
              {pending ? "Aggiunta..." : "Aggiungi"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-body text-black-80">
            Il parcheggio si aggiunge al prospect, assegnato a te; se il prospect è interessato entra subito in Pipeline. I parcheggi più
            vicini alla sede sono in cima.
          </p>
          {choices.length === 0 ? (
            <Alert tone="info">Nessun parcheggio attivo.</Alert>
          ) : (
            <fieldset>
              <legend className="text-label font-semibold tracking-[0.08em] text-black-80 uppercase">Parcheggio</legend>
              <ul className="mt-2 flex flex-col gap-2">
                {choices.map((choice) => (
                  <li key={choice.id}>
                    {choice.openOpportunityId ? (
                      <p className="flex min-h-10 flex-wrap items-center justify-between gap-2 rounded-sm border border-grey-60 bg-grey-20 px-3 py-2 text-body">
                        <span>
                          <span className="font-semibold">{choice.nome}</span>
                          <span className="block text-caption text-black-60">{distanceLabel(choice.distanzaM)}</span>
                        </span>
                        <Link
                          href={`/opportunita/${choice.openOpportunityId}`}
                          className="rounded-xs text-caption font-semibold text-blue-ink underline underline-offset-2"
                        >
                          Già aperta: apri l&apos;opportunità
                        </Link>
                      </p>
                    ) : (
                      <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-sm border border-grey-60 px-3 py-2 text-body has-checked:border-brand-blue has-checked:bg-blue-20">
                        <input
                          type="radio"
                          name="parcheggio-scelto"
                          value={choice.id}
                          checked={parkingId === choice.id}
                          onChange={() => setParkingId(choice.id)}
                          className="size-4 accent-brand-blue"
                        />
                        <span>
                          <span className="font-semibold">{choice.nome}</span>
                          <span className="block text-caption text-black-60">{distanceLabel(choice.distanzaM)}</span>
                        </span>
                      </label>
                    )}
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
          {error && (
            <Alert tone="critical">
              {error}
              {existing && (
                <>
                  {" "}
                  <Link href={`/opportunita/${existing}`} className="font-semibold underline underline-offset-2">
                    Apri quella esistente
                  </Link>
                </>
              )}
            </Alert>
          )}
        </div>
      </Dialog>
    </>
  );
}

// Party list (and pipeline table): checkbox of a row, tied to the selection
// form by its id.
export function SelectPartyCheckbox({ formId, partyId, label, name = "soggetto" }: { formId: string; partyId: string; label: string; name?: string }) {
  return (
    <input
      type="checkbox"
      name={name}
      value={partyId}
      form={formId}
      aria-label={`Seleziona ${label}`}
      className="size-5 cursor-pointer accent-brand-blue"
    />
  );
}

// "Seleziona tutti" of the page, in the table header.
export function SelectAllCheckbox({ formId, label = "Seleziona tutti i prospect della pagina" }: { formId: string; label?: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      className="size-5 cursor-pointer accent-brand-blue"
      onChange={(event) => {
        document
          .querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${formId}"]`)
          .forEach((box) => (box.checked = event.target.checked));
      }}
    />
  );
}

// Bulk "Aggiungi a parcheggio" (A1) for the selected parties of the list,
// with a summary of the opportunities created and the parties skipped.
export function BulkAddToParking({
  formId,
  parkings,
  names,
  extra,
  action = addToParking,
}: {
  formId: string;
  parkings: ParkingOption[];
  // Names of the parties on the page, for the summary.
  names: Record<string, string>;
  // More actions on the same selection (cadence, export).
  extra?: React.ReactNode;
  // For previews and end-to-end tests only.
  action?: typeof addToParking;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<AddToParkingRow[] | null>(null);
  const [pending, startTransition] = useTransition();

  // Count of the selected rows, also when they change outside this form.
  useEffect(() => {
    const count = () =>
      setSelected(document.querySelectorAll(`input[type=checkbox][name=soggetto][form="${formId}"]:checked`).length);
    count();
    document.addEventListener("change", count);
    return () => document.removeEventListener("change", count);
  }, [formId]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const partyIds = data.getAll("soggetto").map(String);
    const parkingId = String(data.get("parcheggio") ?? "");
    if (partyIds.length === 0) return setError("Seleziona almeno un prospect nella tabella.");
    if (!parkingId) return setError("Scegli il parcheggio.");
    startTransition(async () => {
      const result = await safeCall(() => action({ partyIds, parkingId }));
      if (!result.ok) return setError(result.message);
      setSummary(result.data);
      document
        .querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${formId}"], thead input[type=checkbox]`)
        .forEach((box) => (box.checked = false));
      setSelected(0);
      router.refresh();
    });
  }

  const created = summary?.filter((row) => row.esito === "creata") ?? [];
  const skipped = summary?.filter((row) => row.esito === "saltata") ?? [];

  return (
    <>
      <form
        id={formId}
        onSubmit={submit}
        aria-label="Aggiungi i prospect selezionati a un parcheggio"
        className="flex flex-col gap-3 rounded-md border border-grey-60 bg-white p-4 sm:flex-row sm:items-end"
      >
        <p className="text-body sm:mr-auto sm:self-center" aria-live="polite">
          <span className="font-semibold">{selected === 1 ? "1 prospect selezionato" : `${selected} prospect selezionati`}</span>
          <span className="block text-caption text-black-60">Spunta le righe della tabella, poi scegli il parcheggio.</span>
        </p>
        <div className="sm:w-64">
          <Field id="parcheggio-multiplo" label="Parcheggio">
            <Select id="parcheggio-multiplo" name="parcheggio" defaultValue="">
              <option value="">Scegli…</option>
              {parkings.map((parking) => (
                <option key={parking.id} value={parking.id}>
                  {parking.nome}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button type="submit" disabled={pending || selected === 0} aria-busy={pending || undefined}>
          {pending ? "Aggiunta..." : "Aggiungi a parcheggio"}
        </Button>
        {extra}
      </form>
      {error && <Alert tone="critical">{error}</Alert>}
      <Dialog
        open={summary !== null}
        title="Aggiunta al parcheggio"
        onClose={() => setSummary(null)}
        footer={
          <Button variant="primary" size="md" onClick={() => setSummary(null)}>
            Chiudi
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-body">
            <strong>{created.length === 1 ? "1 opportunità creata" : `${created.length} opportunità create`}</strong>,{" "}
            <strong>{skipped.length === 1 ? "1 prospect saltato" : `${skipped.length} prospect saltati`}</strong>.
          </p>
          {skipped.length > 0 && (
            <ul className="flex flex-col gap-2">
              {skipped.map((row) => (
                <li key={row.partyId} className="text-body">
                  <span className="font-semibold">{names[row.partyId] ?? "Prospect"}</span>: {row.motivo}
                  {row.opportunityId && (
                    <>
                      {" "}
                      <Link href={`/opportunita/${row.opportunityId}`} className="rounded-xs text-blue-ink underline underline-offset-2">
                        apri l&apos;opportunità
                      </Link>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>
    </>
  );
}

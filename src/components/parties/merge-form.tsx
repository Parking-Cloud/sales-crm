"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { mergeParties } from "@/app/(app)/prospect/actions";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PARTY_TYPE_LABELS, PRIVATE_PARKING_LABELS, partyName } from "@/lib/parties/labels";
import type { Party } from "@/lib/parties/queries";

// Fields offered in the merge, in display order.
const MERGE_FIELDS = [
  ["tipo", "Tipo"],
  ["denominazione", "Denominazione"],
  ["nome", "Nome"],
  ["cognome", "Cognome"],
  ["categoria", "Categoria"],
  ["piva", "Partita IVA"],
  ["codice_fiscale", "Codice fiscale"],
  ["sito", "Sito"],
  ["telefono", "Telefono"],
  ["email", "Email"],
  ["form_web_url", "Form sul sito"],
  ["dipendenti_stimati", "Dipendenti stimati"],
  ["parcheggio_privato", "Parcheggio privato"],
] as const;
type MergeField = (typeof MERGE_FIELDS)[number][0];

function display(field: MergeField, value: unknown): string {
  if (value === null || value === undefined || value === "") return "vuoto";
  if (field === "tipo") return PARTY_TYPE_LABELS[value as Party["tipo"]];
  if (field === "parcheggio_privato") return PRIVATE_PARKING_LABELS[value as Party["parcheggio_privato"]];
  return String(value);
}

const empty = (value: unknown) => value === null || value === undefined || value === "" || value === "non_noto";

export type MergeCounts = { sedi: number; contatti: number };

export function MergeForm({
  a,
  b,
  counts,
  initiallyOpen = false,
}: {
  a: Party;
  b: Party;
  counts: Record<string, MergeCounts>;
  // For previews only.
  initiallyOpen?: boolean;
}) {
  const router = useRouter();
  const [keepId, setKeepId] = useState(a.id);
  const keep = keepId === a.id ? a : b;
  const drop = keepId === a.id ? b : a;
  const conflicts = MERGE_FIELDS.filter(([field]) => String(a[field] ?? "") !== String(b[field] ?? ""));
  const defaultChoice = (field: MergeField) => (empty(keep[field]) && !empty(drop[field]) ? drop.id : keep.id);
  const [choices, setChoices] = useState<Partial<Record<MergeField, string>>>({});
  const choiceOf = (field: MergeField) => choices[field] ?? defaultChoice(field);

  const [open, setOpen] = useState(initiallyOpen);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    const values: Record<string, unknown> = {};
    conflicts.forEach(([field]) => {
      values[field] = (choiceOf(field) === a.id ? a : b)[field];
    });
    setError(null);
    startTransition(async () => {
      const result = await mergeParties(keep.id, drop.id, values);
      if (!result.ok) {
        setOpen(false);
        setError(result.message ?? "Unione non riuscita.");
        return;
      }
      router.push(`/prospect/${keep.id}`);
    });
  }

  const moved = counts[drop.id] ?? { sedi: 0, contatti: 0 };

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert tone="critical">{error}</Alert>}

      <fieldset className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
        <legend className="px-1 text-h4 font-semibold">Prospect che resta</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {[a, b].map((party) => (
            <label
              key={party.id}
              className={`flex cursor-pointer items-start gap-3 rounded-sm border p-4 ${keepId === party.id ? "border-brand-blue bg-blue-20" : "border-grey-60"}`}
            >
              <input
                type="radio"
                name="resta"
                value={party.id}
                checked={keepId === party.id}
                onChange={() => {
                  setKeepId(party.id);
                  setChoices({});
                }}
                className="mt-1 size-5 accent-brand-blue"
              />
              <span>
                <span className="block font-semibold">{partyName(party)}</span>
                <span className="block text-caption text-black-60">
                  {counts[party.id]?.sedi ?? 0} sedi · {counts[party.id]?.contatti ?? 0} contatti
                </span>
                <span className="mt-1 block text-caption font-semibold">{keepId === party.id ? "Resta" : "Viene unito e nascosto"}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="campi-conflitto">
        <h2 id="campi-conflitto" className="text-h4 font-semibold">
          Campi diversi
        </h2>
        {conflicts.length === 0 ? (
          <p className="mt-2 text-body text-black-60">Nessun campo in conflitto.</p>
        ) : (
          <>
            <p className="mt-1 text-body text-black-60">Per ogni campo scegli il valore da tenere.</p>
            <div className="mt-4 flex flex-col divide-y divide-grey-60">
              {conflicts.map(([field, label]) => (
                <fieldset key={field} className="grid gap-2 py-3 sm:grid-cols-[180px_1fr_1fr] sm:items-center">
                  <legend className="sr-only">{label}</legend>
                  <span aria-hidden="true" className="text-label font-semibold tracking-[0.08em] text-black-80 uppercase">
                    {label}
                  </span>
                  {[keep, drop].map((party) => (
                    <label key={party.id} className="flex min-w-0 cursor-pointer items-start gap-2">
                      <input
                        type="radio"
                        name={`campo_${field}`}
                        checked={choiceOf(field) === party.id}
                        onChange={() => setChoices((previous) => ({ ...previous, [field]: party.id }))}
                        className="mt-1 size-5 shrink-0 accent-brand-blue"
                      />
                      <span className="min-w-0 break-words">
                        {display(field, party[field])}
                        <span className="block text-caption text-black-60">da {partyName(party)}</span>
                      </span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          </>
        )}
      </section>

      <Alert tone="info" title="Cosa succede">
        Sul prospect che resta si spostano {moved.sedi} sedi e {moved.contatti} contatti di {partyName(drop)}, insieme a
        provenienze dei dati e riferimenti esterni. {partyName(drop)} sparisce dagli elenchi e il suo indirizzo porta
        al prospect che resta. L&apos;operazione è registrata nella cronologia.
      </Alert>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <ButtonLink href={`/prospect/${a.id}`} size="md">
          Annulla
        </ButtonLink>
        <Button variant="primary" size="md" onClick={() => setOpen(true)}>
          Unisci i prospect
        </Button>
      </div>

      <ConfirmDialog
        open={open}
        title="Unire i due prospect?"
        confirmLabel="Unisci"
        pending={pending}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      >
        <p>
          <strong>{partyName(drop)}</strong> verrà unito in <strong>{partyName(keep)}</strong>. Solo
          l&apos;amministratore può farlo e non si annulla dall&apos;interfaccia.
        </p>
      </ConfirmDialog>
    </div>
  );
}

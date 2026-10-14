"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { ImportCandidate, ImportChoice, ImportSummary } from "@/lib/places/types";

type State = { step: "loading" } | { step: "choose"; candidates: ImportCandidate[] } | { step: "done"; summary: ImportSummary } | null;

// Choice for a result with a duplicate warning: "unisci:<partyId>",
// "crea" or "salta". Empty until the user decides.
type Pick = string;

const ESITI: Record<string, { label: string; tone: "success" | "info" | "neutral" | "attention" }> = {
  creato: { label: "Creato", tone: "success" },
  aggiunto: { label: "Aggiunto all'esistente", tone: "info" },
  saltato: { label: "Saltato", tone: "neutral" },
  da_decidere: { label: "Da decidere", tone: "attention" },
};

export function ImportDialog({
  state,
  pending,
  onConfirm,
  onClose,
}: {
  state: State;
  pending: boolean;
  onConfirm: (candidates: ImportCandidate[], choices: ImportChoice[]) => void;
  onClose: () => void;
}) {
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const candidates = state?.step === "choose" ? state.candidates : [];
  useEffect(() => setPicks({}), [state?.step]);

  const warned = candidates.filter((item) => item.check === "avviso");
  const skipped = candidates.filter((item) => item.check === "blocco" || item.check === "sparito");
  const fresh = candidates.filter((item) => item.check === "nuovo");
  const undecided = warned.filter((item) => !picks[item.placeId]).length;
  const toImport = candidates.filter((item) => item.check === "nuovo" || (item.check === "avviso" && picks[item.placeId] && picks[item.placeId] !== "salta"));

  function confirm() {
    const choices: ImportChoice[] = warned.map((item) => {
      const pick = picks[item.placeId] ?? "";
      return pick.startsWith("unisci:")
        ? { placeId: item.placeId, scelta: "unisci", unisciA: pick.slice("unisci:".length) }
        : { placeId: item.placeId, scelta: pick === "crea" ? "crea" : null, unisciA: null };
    });
    onConfirm(toImport, choices);
  }

  const title =
    state?.step === "done" ? "Import completato" : state?.step === "choose" ? (toImport.length === 1 ? "Importare 1 risultato?" : `Importare ${toImport.length} risultati?`) : "Lettura dei dettagli da Google...";

  return (
    <Dialog
      open={state !== null}
      title={title}
      busy={pending}
      onClose={onClose}
      footer={
        state?.step === "done" ? (
          <Button variant="primary" size="md" onClick={onClose}>
            Chiudi
          </Button>
        ) : (
          <>
            <Button size="md" onClick={onClose} disabled={pending}>
              Annulla
            </Button>
            {state?.step === "choose" && (
              <Button variant="primary" size="md" onClick={confirm} disabled={pending || undecided > 0 || toImport.length === 0} aria-busy={pending || undefined}>
                {pending ? "Import..." : `Importa ${toImport.length}`}
              </Button>
            )}
          </>
        )
      }
    >
      {state?.step === "loading" && <p className="text-body text-black-80">Leggo telefono, sito e indirizzo dei risultati scelti e controllo i doppioni.</p>}

      {state?.step === "choose" && (
        <div className="flex flex-col gap-5">
          <p className="text-body text-black-80">
            Per ogni risultato importato si crea il soggetto (azienda) con la sede e un&apos;opportunità &ldquo;Individuata&rdquo; sul parcheggio,
            assegnata a te. I dati arrivano da Google Places e restano &ldquo;da verificare&rdquo;.
          </p>

          {warned.length > 0 && (
            <section aria-labelledby="import-avvisi" className="flex flex-col gap-3">
              <h3 id="import-avvisi" className="text-body font-semibold">
                Possibili doppioni: scegli cosa fare ({warned.length})
              </h3>
              {undecided > 0 && <Alert tone="warning">{undecided === 1 ? "Manca 1 scelta." : `Mancano ${undecided} scelte.`}</Alert>}
              {warned.map((item) => (
                <fieldset key={item.placeId} className="rounded-sm border border-grey-60 p-3">
                  <legend className="px-1 font-semibold">{item.name}</legend>
                  <p className="text-caption text-black-80">{[item.indirizzo, item.cap, item.citta].filter(Boolean).join(", ") || "Indirizzo non indicato"}</p>
                  <div className="mt-2 flex flex-col gap-2 text-body">
                    {item.candidates.map((candidate) => (
                      <label key={candidate.partyId} className="flex items-start gap-2">
                        <input
                          type="radio"
                          name={`scelta-${item.placeId}`}
                          className="mt-1 size-4 accent-brand-blue"
                          checked={picks[item.placeId] === `unisci:${candidate.partyId}`}
                          onChange={() => setPicks((current) => ({ ...current, [item.placeId]: `unisci:${candidate.partyId}` }))}
                        />
                        <span>
                          Aggiungi all&apos;esistente:{" "}
                          <Link href={`/soggetti/${candidate.partyId}`} target="_blank" className="rounded-xs font-semibold text-blue-ink underline underline-offset-2">
                            {candidate.name}
                            <span className="sr-only"> (si apre in una nuova scheda)</span>
                          </Link>
                          <span className="block text-caption text-black-80">{candidate.reason}. Si aggiunge solo l&apos;opportunità sul parcheggio.</span>
                        </span>
                      </label>
                    ))}
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`scelta-${item.placeId}`}
                        className="size-4 accent-brand-blue"
                        checked={picks[item.placeId] === "crea"}
                        onChange={() => setPicks((current) => ({ ...current, [item.placeId]: "crea" }))}
                      />
                      Crea comunque un nuovo soggetto
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`scelta-${item.placeId}`}
                        className="size-4 accent-brand-blue"
                        checked={picks[item.placeId] === "salta"}
                        onChange={() => setPicks((current) => ({ ...current, [item.placeId]: "salta" }))}
                      />
                      Non importare
                    </label>
                  </div>
                </fieldset>
              ))}
            </section>
          )}

          {fresh.length > 0 && (
            <section aria-labelledby="import-nuovi">
              <h3 id="import-nuovi" className="text-body font-semibold">
                Nuovi ({fresh.length})
              </h3>
              <ul className="mt-2 flex flex-col gap-1 text-body">
                {fresh.map((item) => (
                  <li key={item.placeId}>
                    <span className="font-semibold">{item.name}</span>
                    <span className="text-caption text-black-80"> · {item.category}{item.telefono ? ` · ${item.telefono}` : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {skipped.length > 0 && (
            <section aria-labelledby="import-saltati">
              <h3 id="import-saltati" className="text-body font-semibold">
                Non importati ({skipped.length})
              </h3>
              <ul className="mt-2 flex flex-col gap-1 text-body">
                {skipped.map((item) => (
                  <li key={item.placeId}>
                    <span className="font-semibold">{item.name}</span>
                    <span className="text-caption text-black-80"> · {item.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {state?.step === "done" && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-3 gap-3">
            {[
              ["Creati", state.summary.creati],
              ["Aggiunti a esistenti", state.summary.aggiunti],
              ["Saltati", state.summary.saltati],
            ].map(([label, value]) => (
              <div key={label} className="rounded-sm border border-grey-60 p-3">
                <dt className="text-label font-semibold tracking-[0.08em] text-black-60 uppercase">{label}</dt>
                <dd className="mt-1 text-h3 font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <ul className="flex flex-col divide-y divide-grey-60">
            {state.summary.righe.map((row) => (
              <li key={row.placeId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {row.partyId ? (
                    <Link href={`/soggetti/${row.partyId}`} className="rounded-xs font-semibold text-blue-ink underline underline-offset-2">
                      {row.name}
                    </Link>
                  ) : (
                    <span className="font-semibold">{row.name}</span>
                  )}
                  {row.reason && <span className="block text-caption text-black-80">{row.reason}</span>}
                </span>
                <Badge tone={ESITI[row.esito]?.tone ?? "neutral"}>{ESITI[row.esito]?.label ?? row.esito}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Dialog>
  );
}

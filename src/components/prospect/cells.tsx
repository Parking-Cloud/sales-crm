"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addToParking } from "@/app/(app)/pipeline/actions";
import {
  removeParking,
  savePrimaryContact,
  saveProspectNote,
  setOfferStatus,
  setProspectStatus,
  updatePipelineField,
  updateProspectField,
} from "@/app/(app)/prospect/table-actions";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { AlertCircleIcon } from "@/components/ui/icons";
import { safeCall } from "@/lib/import/safe-call";
import { LOSS_REASON_LABELS } from "@/lib/pipeline/labels";
import {
  OFFER_STATUS_LABELS,
  OFFER_STATUS_TONES,
  PROSPECT_STATUS_LABELS,
  PROSPECT_STATUS_TONES,
  REASON_CHOICES,
  reasonLabel,
  type OfferStatus,
  type ProspectStatus,
} from "@/lib/prospect/labels";
import type { ProspectParking } from "@/lib/prospect/queries";
import { reminderDue } from "@/lib/tables/reminders";

// Cells shared by the Prospect, Pipeline and Promemoria tables (block 1a-9).

// The server actions of the tables; replaced only in previews and end-to-end
// tests.
export const TABLE_ACTIONS = {
  setProspectStatus,
  updateProspectField,
  saveProspectNote,
  savePrimaryContact,
  addToParking,
  removeParking,
  setOfferStatus,
  updatePipelineField,
};
export type TableActions = typeof TABLE_ACTIONS;

export const REASON_OPTIONS = REASON_CHOICES.map((value) => ({ value, label: LOSS_REASON_LABELS[value] }));

export function ProspectStatusBadge({ stato, motivo }: { stato: ProspectStatus; motivo?: string | null }) {
  const why = reasonLabel(motivo);
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge tone={PROSPECT_STATUS_TONES[stato]}>{PROSPECT_STATUS_LABELS[stato]}</Badge>
      {why && <span className="text-caption text-black-60">{why}</span>}
    </span>
  );
}

export function OfferStatusBadge({ stato, motivo }: { stato: OfferStatus; motivo?: string | null }) {
  const why = stato === "rifiutata" ? reasonLabel(motivo) : null;
  return (
    <span className="flex flex-col items-start gap-1">
      <Badge tone={OFFER_STATUS_TONES[stato]}>{OFFER_STATUS_LABELS[stato]}</Badge>
      {why && <span className="text-caption text-black-60">{why}</span>}
    </span>
  );
}

// "tra 4 giorni", "oggi", "scaduto da 2 giorni" next to the date.
export function ReminderBadge({ days }: { days: number | null }) {
  const due = reminderDue(days);
  if (!due) return null;
  return <Badge tone={due.tone}>{due.label}</Badge>;
}

export function formatDay(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

// Car parks of a prospect: remove one (with a confirmation), add one.
export function ParkingCell({
  partyId,
  partyName,
  parkings,
  choices,
  disabled,
  actions = TABLE_ACTIONS,
}: {
  partyId: string;
  partyName: string;
  parkings: ProspectParking[];
  // Active car parks.
  choices: { id: string; nome: string }[];
  disabled: boolean;
  actions?: TableActions;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const present = new Set(parkings.map((parking) => parking.parking_id));
  const available = choices.filter((choice) => !present.has(choice.id));

  function add(parkingId: string) {
    if (!parkingId) return setAdding(false);
    setError(null);
    startTransition(async () => {
      const result = await safeCall(() => actions.addToParking({ partyIds: [partyId], parkingId }));
      if (!result.ok) return setError(result.message);
      const row = result.data[0];
      if (row?.esito !== "creata") return setError(row?.motivo ?? "Parcheggio non aggiunto.");
      setAdding(false);
      router.refresh();
    });
  }

  function remove(parkingId: string) {
    setError(null);
    startTransition(async () => {
      const result = await safeCall(() => actions.removeParking(partyId, parkingId));
      if (!result.ok) {
        setConfirming(null);
        return setError(result.message);
      }
      setConfirming(null);
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-48 flex-col gap-1" aria-busy={pending || undefined}>
      {parkings.length === 0 && !adding && <span className="text-black-40">–</span>}
      <ul className="flex flex-col gap-1">
        {parkings.map((parking) => (
          <li key={parking.parking_id} className="flex flex-wrap items-center gap-1">
            {confirming === parking.parking_id ? (
              <span className="flex flex-wrap items-center gap-1 rounded-xs bg-grey-20 px-2 py-1 text-caption">
                Togliere {parking.nome}?
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => remove(parking.parking_id)}
                  className="rounded-xs px-1 font-semibold text-error-ink underline underline-offset-2"
                >
                  {pending ? "..." : "Sì, togli"}
                </button>
                <button type="button" disabled={pending} onClick={() => setConfirming(null)} className="rounded-xs px-1 font-semibold text-blue-ink underline underline-offset-2">
                  No
                </button>
              </span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1 rounded-pill border border-grey-80 bg-grey-20 py-0.5 pr-1 pl-2 text-caption font-semibold">
                  {parking.nome}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => setConfirming(parking.parking_id)}
                      aria-label={`Togli ${parking.nome} da ${partyName}`}
                      className="inline-flex size-5 items-center justify-center rounded-pill text-black-60 hover:bg-grey-60 hover:text-brand-black"
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  )}
                </span>
                {parking.stato_offerta && <span className="sr-only">, in pipeline: {OFFER_STATUS_LABELS[parking.stato_offerta]}</span>}
              </>
            )}
          </li>
        ))}
      </ul>
      {!disabled &&
        (adding ? (
          <select
            autoFocus
            aria-label={`Aggiungi un parcheggio a ${partyName}`}
            defaultValue=""
            disabled={pending}
            onChange={(event) => add(event.target.value)}
            onBlur={() => !pending && setAdding(false)}
            onKeyDown={(event) => event.key === "Escape" && setAdding(false)}
            className="h-(--control-h-sm) w-full rounded-xs border border-brand-blue bg-white px-2 text-[14px]"
          >
            <option value="">Scegli il parcheggio…</option>
            {available.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.nome}
              </option>
            ))}
          </select>
        ) : (
          available.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setAdding(true);
              }}
              aria-label={`Aggiungi un parcheggio a ${partyName}`}
              className="self-start rounded-xs text-caption font-semibold text-blue-ink underline-offset-2 hover:underline"
            >
              + Aggiungi
            </button>
          )
        ))}
      {error && (
        <p role="alert" className="flex items-start gap-1 text-caption text-error-ink">
          <AlertCircleIcon size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

// "Invio email": opens "Prepara email" as a pop-up over the table.
export function EmailButton({ partyId, opportunityId, blocked }: { partyId: string; opportunityId?: string; blocked: string | null }) {
  if (blocked) return <span className="text-caption text-black-60">{blocked}</span>;
  const params = new URLSearchParams({ soggetto: partyId });
  if (opportunityId) params.set("opportunita", opportunityId);
  return (
    <Link href={`/email/prepara?${params.toString()}`} scroll={false} className={buttonClasses("secondary", "sm")}>
      Prepara email
    </Link>
  );
}

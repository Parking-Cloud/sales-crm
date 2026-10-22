"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { addToParking } from "@/app/(app)/pipeline/actions";
import {
  listProspectContacts,
  removeParking,
  saveContactField,
  savePrimaryContact,
  setPrimaryContact,
  setRowContact,
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
import type { ProspectContact } from "@/app/(app)/prospect/table-actions";
import { reminderDue } from "@/lib/tables/reminders";

// Cells shared by the Prospect, Pipeline and Promemoria tables (block 1a-9).

// The server actions of the tables; replaced only in previews and end-to-end
// tests.
export const TABLE_ACTIONS = {
  listProspectContacts,
  setPrimaryContact,
  setRowContact,
  saveContactField,
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
// The contact person of the row is proposed; another can be chosen there.
export function EmailButton({
  partyId,
  opportunityId,
  contactId,
  blocked,
}: {
  partyId: string;
  opportunityId?: string;
  contactId?: string | null;
  blocked: string | null;
}) {
  if (blocked) return <span className="text-caption text-black-60">{blocked}</span>;
  const params = new URLSearchParams({ soggetto: partyId });
  if (opportunityId) params.set("opportunita", opportunityId);
  if (contactId) params.set("contatto", contactId);
  return (
    <Link href={`/email/prepara?${params.toString()}`} scroll={false} className={buttonClasses("secondary", "sm")}>
      Prepara email
    </Link>
  );
}

// "+N" next to the contact person: a small menu with all the prospect's
// contacts (name, role, telephone, email) and "Rendi principale", without
// leaving the table.
export function ContactsMenu({
  partyId,
  partyName,
  others,
  actions = TABLE_ACTIONS,
}: {
  partyId: string;
  partyName: string;
  // Contacts besides the main one.
  others: number;
  actions?: TableActions;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Fixed position under the button: the table scrolls and would cut it.
  const [place, setPlace] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [contacts, setContacts] = useState<ProspectContact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpen(false);
    };
    // The menu follows its button when the page or the table scrolls.
    const onScroll = (event: Event) => {
      if (panelRef.current?.contains(event.target as Node) || !buttonRef.current) return;
      const box = buttonRef.current.getBoundingClientRect();
      setPlace({ top: box.bottom + 4, left: Math.max(8, Math.min(box.left, window.innerWidth - 328)) });
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function load() {
    setError(null);
    startTransition(async () => {
      const result = await safeCall(() => actions.listProspectContacts(partyId));
      if (!result.ok) return setError(result.message);
      setContacts(result.data);
    });
  }

  function toggle() {
    const next = !open;
    if (next && buttonRef.current) {
      const box = buttonRef.current.getBoundingClientRect();
      setPlace({ top: box.bottom + 4, left: Math.max(8, Math.min(box.left, window.innerWidth - 328)) });
    }
    setOpen(next);
    if (next) load();
  }

  function makeMain(contactId: string) {
    setError(null);
    startTransition(async () => {
      const result = await safeCall(() => actions.setPrimaryContact(contactId, partyId));
      if (!result.ok) return setError(result.message);
      const list = await safeCall(() => actions.listProspectContacts(partyId));
      if (list.ok) setContacts(list.data);
      router.refresh();
    });
  }

  if (others <= 0) return null;
  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Altri ${others} ${others === 1 ? "contatto" : "contatti"} di ${partyName}`}
        className="inline-flex min-h-6 items-center rounded-pill border border-grey-80 bg-grey-20 px-2 text-caption font-semibold text-blue-ink hover:bg-blue-20"
      >
        +{others}
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="group"
          aria-label={`Contatti di ${partyName}`}
          aria-busy={pending || undefined}
          style={{ top: place.top, left: place.left }}
          className="fixed z-30 max-h-80 w-80 max-w-[calc(100vw-16px)] overflow-y-auto rounded-sm border border-grey-60 bg-white p-2 shadow-lg"
        >
          {contacts === null ? (
            <p className="p-2 text-caption text-black-60">{error ? "" : "Caricamento..."}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-grey-60">
              {contacts.map((contact) => (
                <li key={contact.id} className="flex flex-col gap-1 p-2 text-[13px]">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{contact.nome}</span>
                    {contact.principale && <Badge tone="info">Principale</Badge>}
                  </span>
                  {contact.ruolo && <span className="text-black-60">{contact.ruolo}</span>}
                  <span className="text-black-80">{contact.telefono ?? "Telefono –"}</span>
                  <span className="break-all text-black-80">{contact.email ?? "Email –"}</span>
                  {!contact.principale && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => makeMain(contact.id)}
                      aria-label={`Rendi principale: ${contact.nome}`}
                      className="self-start rounded-xs font-semibold text-blue-ink underline underline-offset-2 disabled:opacity-60"
                    >
                      Rendi principale
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="flex items-start gap-1 p-2 text-caption text-error-ink">
              <AlertCircleIcon size={14} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

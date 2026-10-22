"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { EditableSelect, EditableText } from "@/components/data-table/editable";
import { AlertCircleIcon } from "@/components/ui/icons";
import { DoNotContactBadge } from "@/components/parties/data-status-badge";
import { OFFER_STATUSES, OFFER_STATUS_LABELS, type OfferStatus } from "@/lib/prospect/labels";
import { ALL_OFFERS, PIPELINE_REMINDER_FILTERS, REMINDER_DUE_FILTERS } from "@/lib/prospect/filters";
import type { PipelineRow } from "@/lib/prospect/queries";
import { safeCall } from "@/lib/import/safe-call";
import type { TableQuery } from "@/lib/tables/query";
import { formatDay, OfferStatusBadge, REASON_OPTIONS, ReminderBadge, TABLE_ACTIONS, type TableActions } from "./cells";

const OFFER_OPTIONS = OFFER_STATUSES.map((value) => ({ value, label: OFFER_STATUS_LABELS[value] }));

type Option = { id: string; nome: string };

function CompanyLink({ row }: { row: PipelineRow }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <Link href={`/prospect/${row.partyId}`} className="rounded-xs font-semibold break-words text-blue-ink underline-offset-2 hover:underline">
        {row.nome}
      </Link>
      {row.nonContattare && <DoNotContactBadge />}
    </span>
  );
}

// Date of the reminder, edited in place, with "tra N giorni" / "oggi" /
// "scaduto da N giorni" next to it.
function ReminderCell({ row, actions }: { row: PipelineRow; actions: TableActions }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <EditableText
        value={row.promemoria}
        type="date"
        label={`Promemoria di ${row.nome}, ${row.parcheggio}`}
        display={formatDay}
        onSave={(value) => actions.updatePipelineField(row.id, "promemoria_il", value)}
      />
      <ReminderBadge days={row.giorni} />
    </span>
  );
}

function NoteCell({ row, label, actions }: { row: PipelineRow; label: string; actions: TableActions }) {
  return (
    <EditableText
      value={row.note}
      label={`${label} di ${row.nome}, ${row.parcheggio}`}
      maxLength={2000}
      display={(value) => <span className="line-clamp-3 break-words whitespace-pre-line">{value}</span>}
      onSave={(value) => actions.updatePipelineField(row.id, "note", value)}
    />
  );
}

// Pipeline (block 1a-9): one row per prospect + car park of the leads.
// Telephone, email and contact person are the prospect's (same data as the
// Prospect table).
export function PipelineTable({
  rows,
  total,
  query,
  parkings,
  users,
  actions = TABLE_ACTIONS,
}: {
  rows: PipelineRow[];
  total: number;
  query: TableQuery;
  parkings: Option[];
  users: Option[];
  // For previews and end-to-end tests only.
  actions?: TableActions;
}) {
  const { savePrimaryContact, setOfferStatus, updatePipelineField } = actions;
  const userOptions = users.map((user) => ({ value: user.id, label: user.nome }));
  const columns: Column<PipelineRow>[] = [
    {
      key: "nome",
      label: "Nome azienda",
      sort: "nome",
      sticky: true,
      width: "min-w-48 max-w-64",
      filter: { param: "nome", type: "text", placeholder: "Cerca nome" },
      cell: (row) => <CompanyLink row={row} />,
    },
    {
      key: "parcheggio",
      label: "Parcheggio",
      sort: "parcheggio",
      width: "min-w-36",
      filter: { param: "parcheggio", type: "select", options: parkings.map((parking) => ({ value: parking.id, label: parking.nome })) },
      cell: (row) => <span className="font-semibold">{row.parcheggio}</span>,
    },
    {
      key: "responsabile",
      label: "Responsabile",
      sort: "responsabile",
      width: "min-w-40",
      filter: { param: "responsabile", type: "select", options: [...userOptions, { value: "nessuno", label: "Nessuno" }] },
      cell: (row) => (
        <EditableSelect
          value={row.responsabileId}
          label={`Responsabile di ${row.nome}, ${row.parcheggio}`}
          options={userOptions}
          emptyLabel="Nessuno"
          onSave={(value) => updatePipelineField(row.id, "responsabile_id", value)}
          display={() => (row.responsabile ? <span>{row.responsabile}</span> : <span className="text-black-40">–</span>)}
        />
      ),
    },
    {
      key: "telefono",
      label: "Telefono",
      sort: "telefono",
      width: "min-w-40",
      filter: { param: "telefono", type: "text" },
      cell: (row) => <EditableText value={row.telefono} type="tel" label={`Telefono di ${row.nome}`} onSave={(value) => savePrimaryContact(row.partyId, "telefono", value)} />,
    },
    {
      key: "email",
      label: "Email",
      sort: "email",
      width: "min-w-52",
      filter: { param: "email", type: "text" },
      cell: (row) => <EditableText value={row.email} type="email" label={`Email di ${row.nome}`} onSave={(value) => savePrimaryContact(row.partyId, "email", value)} />,
    },
    {
      key: "referente",
      label: "Nome referente",
      sort: "referente",
      width: "min-w-44",
      filter: { param: "referente", type: "text" },
      cell: (row) => <EditableText value={row.referente} label={`Referente di ${row.nome}`} onSave={(value) => savePrimaryContact(row.partyId, "referente", value)} />,
    },
    {
      key: "stato",
      label: "Stato offerta",
      sort: "stato",
      width: "min-w-44",
      filter: {
        param: "offerta",
        type: "select",
        options: [...OFFER_OPTIONS, { value: ALL_OFFERS, label: "Tutti gli stati" }],
        allLabel: "Attivi (da inviare, inviata)",
      },
      cell: (row) => (
        <EditableSelect
          value={row.statoOfferta}
          label={`Stato offerta di ${row.nome}, ${row.parcheggio}`}
          options={OFFER_OPTIONS}
          reason={{ for: ["rifiutata"], label: "Motivo (facoltativo)", options: REASON_OPTIONS }}
          onSave={(value, motivo) => setOfferStatus(row.id, value, motivo)}
          display={(value) => <OfferStatusBadge stato={value as OfferStatus} motivo={row.motivoRifiuto} />}
        />
      ),
    },
    {
      key: "note",
      label: "Note",
      sort: "note",
      width: "min-w-56",
      filter: { param: "note", type: "text" },
      cell: (row) => <NoteCell row={row} label="Note" actions={actions} />,
    },
    {
      key: "promemoria",
      label: "Promemoria",
      sort: "promemoria",
      width: "min-w-44",
      filter: { param: "promemoria", type: "select", options: Object.entries(PIPELINE_REMINDER_FILTERS).map(([value, label]) => ({ value, label })) },
      cell: (row) => <ReminderCell row={row} actions={actions} />,
    },
  ];

  return (
    <DataTable
      caption="Pipeline"
      columns={columns}
      rows={rows}
      total={total}
      query={query}
      empty="Nessun lead attivo: un prospect entra in pipeline quando diventa Interessato o Molto interessato. Accettate e rifiutate si vedono con il filtro Stato offerta."
    />
  );
}

// Promemoria (block 1a-9): leads with a reminder date, overdue first. Date
// and note are edited in place; "Fatto" clears the date.
export function ReminderTable({
  rows,
  total,
  query,
  parkings,
  actions = TABLE_ACTIONS,
}: {
  rows: PipelineRow[];
  total: number;
  query: TableQuery;
  parkings: Option[];
  // For previews and end-to-end tests only.
  actions?: TableActions;
}) {
  const columns: Column<PipelineRow>[] = [
    {
      key: "parcheggio",
      label: "Nome parcheggio",
      sort: "parcheggio",
      width: "min-w-36",
      filter: { param: "parcheggio", type: "select", options: parkings.map((parking) => ({ value: parking.id, label: parking.nome })) },
      cell: (row) => <span className="font-semibold">{row.parcheggio}</span>,
    },
    {
      key: "nome",
      label: "Nome azienda",
      sort: "nome",
      sticky: true,
      width: "min-w-48 max-w-64",
      filter: { param: "nome", type: "text", placeholder: "Cerca nome" },
      cell: (row) => <CompanyLink row={row} />,
    },
    {
      key: "email",
      label: "Email",
      sort: "email",
      filter: { param: "email", type: "text" },
      cell: (row) =>
        row.email ? (
          <a href={`mailto:${row.email}`} className="rounded-xs break-all text-blue-ink underline-offset-2 hover:underline">
            {row.email}
          </a>
        ) : (
          <span className="text-black-40">–</span>
        ),
    },
    {
      key: "telefono",
      label: "Telefono",
      sort: "telefono",
      filter: { param: "telefono", type: "text" },
      cell: (row) =>
        row.telefono ? (
          <a href={`tel:${row.telefono.split(",")[0].trim()}`} className="rounded-xs whitespace-nowrap text-blue-ink underline-offset-2 hover:underline">
            {row.telefono}
          </a>
        ) : (
          <span className="text-black-40">–</span>
        ),
    },
    {
      key: "promemoria",
      label: "Data scadenza",
      sort: "promemoria",
      width: "min-w-44",
      filter: { param: "scadenza", type: "select", options: Object.entries(REMINDER_DUE_FILTERS).map(([value, label]) => ({ value, label })), allLabel: "Tutte" },
      cell: (row) => <ReminderCell row={row} actions={actions} />,
    },
    {
      key: "note",
      label: "Nota",
      sort: "note",
      width: "min-w-56",
      filter: { param: "note", type: "text" },
      cell: (row) => <NoteCell row={row} label="Nota" actions={actions} />,
    },
    {
      key: "fatto",
      label: "Fatto",
      cell: (row) => <DoneButton row={row} actions={actions} />,
    },
  ];

  return (
    <DataTable
      caption="Promemoria"
      columns={columns}
      rows={rows}
      total={total}
      query={query}
      empty="Nessun promemoria: impostane la data dalla Pipeline."
    />
  );
}

// "Fatto": the reminder date is cleared, the row leaves Promemoria.
function DoneButton({ row, actions }: { row: PipelineRow; actions: TableActions }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        aria-label={`Fatto: svuota il promemoria di ${row.nome}, ${row.parcheggio}`}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await safeCall(() => actions.updatePipelineField(row.id, "promemoria_il", ""));
            if (!result.ok) return setError(result.message);
            router.refresh();
          })
        }
        className="inline-flex min-h-(--control-h) items-center rounded-sm border border-brand-blue bg-white px-3 text-[14px] font-semibold whitespace-nowrap text-brand-blue hover:bg-blue-20 disabled:opacity-60 md:min-h-(--control-h-sm)"
      >
        {pending ? "..." : "Fatto"}
      </button>
      {error && (
        <p role="alert" className="mt-1 flex items-start gap-1 text-caption text-error-ink">
          <AlertCircleIcon size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

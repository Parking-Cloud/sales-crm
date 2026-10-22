"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { EditableSelect, EditableText } from "@/components/data-table/editable";
import { DoNotContactBadge } from "@/components/parties/data-status-badge";
import { PARTY_CATEGORIES } from "@/lib/parties/labels";
import { PROSPECT_STATUSES, PROSPECT_STATUS_LABELS, type ProspectStatus } from "@/lib/prospect/labels";
import { LAST_CONTACT_FILTERS } from "@/lib/prospect/filters";
import type { ProspectRow } from "@/lib/prospect/queries";
import type { TableQuery } from "@/lib/tables/query";
import { ContactsMenu, EmailButton, formatDay, ParkingCell, ProspectStatusBadge, REASON_OPTIONS, TABLE_ACTIONS, type TableActions } from "./cells";

const STATUS_OPTIONS = PROSPECT_STATUSES.map((value) => ({ value, label: PROSPECT_STATUS_LABELS[value] }));
const CATEGORY_OPTIONS = PARTY_CATEGORIES.map((value) => ({ value, label: value }));

// Prospect (block 1a-9): every party, worked from the table. Status, car
// parks, category, telephone, email, last contact, contact person and notes
// are edited in place; "Prepara email" opens as a pop-up.
export function ProspectTable({
  rows,
  total,
  query,
  parkings,
  activeParkings,
  selectionFormId,
  actions = TABLE_ACTIONS,
}: {
  rows: ProspectRow[];
  total: number;
  query: TableQuery;
  // Every car park (filter) and the ones a prospect can be added to.
  parkings: { id: string; nome: string }[];
  activeParkings: { id: string; nome: string }[];
  selectionFormId: string;
  // For previews and end-to-end tests only.
  actions?: TableActions;
}) {
  const { setProspectStatus, updateProspectField, saveProspectNote, savePrimaryContact } = actions;
  const locked = (row: ProspectRow) => row.cancellato;

  const columns: Column<ProspectRow>[] = [
    {
      key: "stato",
      label: "Stato",
      sort: "stato",
      width: "min-w-44",
      filter: { param: "stato", type: "select", options: STATUS_OPTIONS },
      cell: (row) => (
        <EditableSelect
          value={row.stato}
          label={`Stato di ${row.nome}`}
          options={STATUS_OPTIONS}
          disabled={locked(row)}
          reason={{ for: ["non_interessato"], label: "Motivo (facoltativo)", options: REASON_OPTIONS }}
          onSave={(value, motivo) => setProspectStatus(row.id, value, motivo)}
          display={(value) => <ProspectStatusBadge stato={value as ProspectStatus} motivo={row.motivoNonInteresse} />}
        />
      ),
    },
    {
      key: "parcheggio",
      label: "Parcheggio",
      sort: "parcheggio",
      filter: {
        param: "parcheggio",
        type: "select",
        options: [...parkings.map((parking) => ({ value: parking.id, label: parking.nome })), { value: "nessuno", label: "Nessun parcheggio" }],
      },
      cell: (row) => <ParkingCell partyId={row.id} partyName={row.nome} parkings={row.parcheggi} choices={activeParkings} disabled={locked(row)} actions={actions} />,
    },
    {
      key: "nome",
      label: "Nome azienda",
      sort: "nome",
      sticky: true,
      width: "min-w-48 max-w-64",
      filter: { param: "nome", type: "text", placeholder: "Cerca nome" },
      cell: (row) => (
        <span className="flex flex-col items-start gap-1">
          <Link href={`/prospect/${row.id}`} className="rounded-xs font-semibold break-words text-blue-ink underline-offset-2 hover:underline">
            {row.nome}
          </Link>
          {row.nonContattare && <DoNotContactBadge />}
        </span>
      ),
    },
    {
      key: "categoria",
      label: "Categoria",
      sort: "categoria",
      width: "min-w-36",
      filter: { param: "categoria", type: "select", options: CATEGORY_OPTIONS, allLabel: "Tutte" },
      cell: (row) => (
        <EditableSelect
          value={row.categoria}
          label={`Categoria di ${row.nome}`}
          options={CATEGORY_OPTIONS}
          emptyLabel="Nessuna"
          disabled={locked(row)}
          onSave={(value) => updateProspectField(row.id, "categoria", value)}
          display={(value) => (value ? <span>{value}</span> : <span className="text-black-40">–</span>)}
        />
      ),
    },
    {
      key: "telefono",
      label: "Telefono",
      sort: "telefono",
      width: "min-w-40",
      filter: { param: "telefono", type: "text" },
      cell: (row) => (
        <EditableText value={row.telefono} type="tel" label={`Telefono di ${row.nome}`} disabled={locked(row)} onSave={(value) => savePrimaryContact(row.id, "telefono", value)} />
      ),
    },
    {
      key: "email",
      label: "Email",
      sort: "email",
      width: "min-w-52",
      filter: { param: "email", type: "text" },
      cell: (row) => (
        <EditableText value={row.email} type="email" label={`Email di ${row.nome}`} disabled={locked(row)} onSave={(value) => savePrimaryContact(row.id, "email", value)} />
      ),
    },
    {
      key: "ultimo_contatto",
      label: "Ultimo contatto",
      sort: "ultimo_contatto",
      width: "min-w-40",
      filter: { param: "contatto", type: "select", options: Object.entries(LAST_CONTACT_FILTERS).map(([value, label]) => ({ value, label })) },
      cell: (row) => (
        <EditableText
          value={row.ultimoContatto}
          type="date"
          label={`Data ultimo contatto di ${row.nome}`}
          disabled={locked(row)}
          display={formatDay}
          onSave={(value) => updateProspectField(row.id, "ultimo_contatto_il", value)}
        />
      ),
    },
    {
      key: "referente",
      label: "Nome referente",
      sort: "referente",
      width: "min-w-44",
      filter: { param: "referente", type: "text" },
      cell: (row) => (
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1">
            <EditableText value={row.referente} label={`Referente di ${row.nome}`} disabled={locked(row)} onSave={(value) => savePrimaryContact(row.id, "referente", value)} />
          </span>
          <span className="mt-1.5">
            <ContactsMenu partyId={row.id} partyName={row.nome} others={row.altriContatti} actions={actions} />
          </span>
        </span>
      ),
    },
    {
      key: "invio",
      label: "Invio email",
      cell: (row) => (
        <EmailButton
          partyId={row.id}
          contactId={row.contattoId}
          blocked={row.cancellato ? "Dati cancellati" : row.nonContattare ? "Non contattare" : null}
        />
      ),
    },
    {
      key: "note",
      label: "Note",
      sort: "note",
      width: "min-w-56",
      filter: { param: "note", type: "text" },
      cell: (row) => (
        <EditableText
          value={row.note}
          label={`Note di ${row.nome}`}
          maxLength={5000}
          disabled={locked(row)}
          display={(value) => <span className="line-clamp-3 break-words whitespace-pre-line">{value}</span>}
          onSave={(value) => saveProspectNote(row.id, value)}
        />
      ),
    },
  ];

  return (
    <DataTable
      caption="Prospect"
      columns={columns}
      rows={rows}
      total={total}
      query={query}
      empty="Nessun prospect: importali dalla ricerca su mappa o inseriscine uno nuovo."
      selection={{ formId: selectionFormId, label: (row) => row.nome }}
    />
  );
}

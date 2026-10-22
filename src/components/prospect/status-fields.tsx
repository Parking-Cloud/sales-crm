"use client";

import { setProspectStatus, updateProspectField } from "@/app/(app)/prospect/table-actions";
import { EditableSelect, EditableText } from "@/components/data-table/editable";
import { PROSPECT_STATUSES, PROSPECT_STATUS_LABELS, type ProspectStatus } from "@/lib/prospect/labels";
import { formatDay, ProspectStatusBadge, REASON_OPTIONS } from "./cells";

const STATUS_OPTIONS = PROSPECT_STATUSES.map((value) => ({ value, label: PROSPECT_STATUS_LABELS[value] }));

// Status and last contact on the prospect page (block 1a-9): the same data
// and the same in-place editing as the Prospect table.
export function ProspectStatusFields({
  partyId,
  name,
  stato,
  motivo,
  ultimoContatto,
  disabled,
}: {
  partyId: string;
  name: string;
  stato: ProspectStatus;
  motivo: string | null;
  ultimoContatto: string | null;
  disabled: boolean;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-1">
        <dt className="text-label font-semibold tracking-[0.08em] text-black-60 uppercase">Stato</dt>
        <dd className="text-body">
          <EditableSelect
            value={stato}
            label={`Stato di ${name}`}
            options={STATUS_OPTIONS}
            disabled={disabled}
            reason={{ for: ["non_interessato"], label: "Motivo (facoltativo)", options: REASON_OPTIONS }}
            onSave={(value, why) => setProspectStatus(partyId, value, why)}
            display={(value) => <ProspectStatusBadge stato={value as ProspectStatus} motivo={motivo} />}
          />
        </dd>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <dt className="text-label font-semibold tracking-[0.08em] text-black-60 uppercase">Data ultimo contatto</dt>
        <dd className="text-body">
          <EditableText
            value={ultimoContatto}
            type="date"
            label={`Data ultimo contatto di ${name}`}
            disabled={disabled}
            display={formatDay}
            onSave={(value) => updateProspectField(partyId, "ultimo_contatto_il", value)}
          />
        </dd>
      </div>
    </dl>
  );
}

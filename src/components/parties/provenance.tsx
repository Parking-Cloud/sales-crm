import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/field";
import { formatDate } from "@/lib/format";
import { DATA_STATUS_LABELS, type DataStatus } from "@/lib/parties/labels";
import type { DataSource, Provenance } from "@/lib/parties/queries";

const TONES = { verificato: "success", stimato: "attention", da_verificare: "info" } as const;

// Badge next to a tracked field: status in words (never colour alone), then
// source and date. Estimated values always say "Stimato".
export function ProvenanceBadge({ provenance }: { provenance: Provenance | undefined }) {
  if (!provenance) return <Badge tone="neutral">Provenienza non indicata</Badge>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge tone={TONES[provenance.stato]}>{DATA_STATUS_LABELS[provenance.stato]}</Badge>
      <span className="text-caption text-black-60">
        {[provenance.fonte, formatDate(provenance.acquisito_il ?? provenance.updated_at)].filter(Boolean).join(" · ")}
      </span>
    </span>
  );
}

export const DEFAULT_SOURCE_NAME = "Inserimento manuale";

// Status and source pickers for a tracked field in a form. Defaults: "da
// verificare" and "Inserimento manuale". Saved only if the field changes.
export function ProvenancePicker({
  field,
  label,
  sources,
  defaultStatus = "da_verificare",
  defaultSourceId,
}: {
  field: string;
  label: string;
  sources: DataSource[];
  defaultStatus?: DataStatus;
  defaultSourceId?: string | null;
}) {
  const fallback = sources.find((source) => source.nome === DEFAULT_SOURCE_NAME)?.id ?? "";
  return (
    <fieldset className="grid grid-cols-2 gap-2 rounded-sm bg-grey-20 p-2">
      <legend className="sr-only">Provenienza: {label}</legend>
      <label className="flex flex-col gap-1 text-caption text-black-60">
        Stato del dato
        <Select name={`prov_${field}_stato`} defaultValue={defaultStatus} aria-label={`Stato del dato: ${label}`}>
          {(Object.keys(DATA_STATUS_LABELS) as DataStatus[]).map((status) => (
            <option key={status} value={status}>
              {DATA_STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-caption text-black-60">
        Fonte
        <Select name={`prov_${field}_fonte`} defaultValue={defaultSourceId ?? fallback} aria-label={`Fonte: ${label}`}>
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.nome}
            </option>
          ))}
        </Select>
      </label>
    </fieldset>
  );
}

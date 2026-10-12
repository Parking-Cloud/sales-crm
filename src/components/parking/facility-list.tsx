import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, Select } from "@/components/ui/field";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_STATUS_TONES,
  PARKING_TYPE_LABELS,
  type CampaignStatus,
} from "@/lib/parking/labels";
import type { FacilityFilters, FacilityListItem } from "@/lib/parking/queries";

const STATUSES = Object.keys(CAMPAIGN_STATUS_LABELS) as CampaignStatus[];

export function FacilityList({
  items,
  filters,
  isAdmin,
}: {
  items: FacilityListItem[];
  filters: FacilityFilters;
  isAdmin: boolean;
}) {
  const filtered = filters.stato !== null || filters.showArchived;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h2 leading-tight font-semibold">Parcheggi</h1>
          <p className="mt-2 text-body text-black-60">
            {isAdmin
              ? "Parcheggi, listini e stato delle campagne."
              : "Parcheggi, listini e stato delle campagne. Le modifiche spettano all'amministratore."}
          </p>
        </div>
        {isAdmin && (
          <ButtonLink href="/parcheggi/nuovo" variant="primary" size="md">
            Nuovo parcheggio
          </ButtonLink>
        )}
      </div>

      <form
        method="get"
        action="/parcheggi"
        aria-label="Filtri"
        className="mt-6 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-md border border-grey-60 bg-white p-4"
      >
        <div className="w-full sm:w-60">
          <Field id="filtro-stato" label="Stato campagna">
            <Select id="filtro-stato" name="stato" defaultValue={filters.stato ?? ""}>
              <option value="">Tutti</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {CAMPAIGN_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Checkbox
          name="archiviati"
          value="1"
          defaultChecked={filters.showArchived}
          label="Mostra archiviati"
          className="min-h-(--control-h) justify-center"
        />
        <Button type="submit" variant="secondary" size="md">
          Filtra
        </Button>
      </form>

      <div className="mt-6">
        {items.length === 0 ? (
          filtered ? (
            <EmptyState title="Nessun parcheggio con questi filtri">
              Cambia lo stato o mostra anche i parcheggi archiviati.
            </EmptyState>
          ) : (
            <EmptyState title="Nessun parcheggio">
              {isAdmin
                ? "Inserisci il primo parcheggio con il pulsante “Nuovo parcheggio”."
                : "L'amministratore non ha ancora inserito parcheggi."}
            </EmptyState>
          )
        ) : (
          <Table caption="Elenco dei parcheggi">
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Tipo</Th>
                <Th>Città</Th>
                <Th align="end">Posti commercializzabili</Th>
                <Th>Stato campagna</Th>
                <Th>Responsabile</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <Tr key={item.id}>
                  <Td wrap>
                    <span className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/parcheggi/${item.id}`}
                        className="rounded-xs font-semibold text-blue-ink underline-offset-2 hover:underline"
                      >
                        {item.nome}
                      </Link>
                      {item.archived_at && (
                        <Badge tone="neutral" icon="archive">
                          Archiviato
                        </Badge>
                      )}
                    </span>
                  </Td>
                  <Td>{PARKING_TYPE_LABELS[item.tipo]}</Td>
                  <Td>{item.citta ?? "–"}</Td>
                  <Td align="end">{formatNumber(item.posti_commerciali)}</Td>
                  <Td>
                    <Badge tone={CAMPAIGN_STATUS_TONES[item.stato_campagna]}>
                      {CAMPAIGN_STATUS_LABELS[item.stato_campagna]}
                    </Badge>
                  </Td>
                  <Td>{item.responsabile ?? "–"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </>
  );
}

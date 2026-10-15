import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select } from "@/components/ui/field";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { pipelineHref, type PipelineFilters } from "@/lib/pipeline/filters";
import { STAGES, STAGE_LABELS, opportunityBadge } from "@/lib/pipeline/labels";
import type { ParkingOption, PipelineItem, UserOption } from "@/lib/pipeline/queries";
import { ActivityButton } from "./activity-dialog";
import { EnrollButton, type CadenceOption } from "@/components/cadences/enroll-dialog";
import { CadenceLine } from "./cadence-line";
import { SelectAllCheckbox, SelectPartyCheckbox } from "./add-to-parking";
import { NextActivity } from "./next-activity";
import { PipelineBoard } from "./pipeline-board";

const SELECTION_FORM = "selezione-opportunita";

// /pipeline (CRM-16): same query and filters for the kanban and the table.
export function PipelineView({
  items,
  truncated,
  filters,
  parkings,
  users,
  now,
  board,
  cadences = [],
}: {
  items: PipelineItem[];
  truncated: boolean;
  filters: PipelineFilters;
  parkings: ParkingOption[];
  users: UserOption[];
  now: number;
  // For previews: a board with fake actions.
  board?: React.ReactNode;
  // Active cadences, for "Iscrivi a cadenza" from the table.
  cadences?: CadenceOption[];
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h2 leading-tight font-semibold">Pipeline</h1>
          <p className="mt-2 text-body text-black-60">Le opportunità per fase, con la prossima attività.</p>
        </div>
        <nav aria-label="Vista" className="flex rounded-sm border border-brand-grey bg-white p-0.5">
          {(["kanban", "tabella"] as const).map((view) => (
            <Link
              key={view}
              href={pipelineHref(filters, { vista: view })}
              aria-current={filters.vista === view ? "page" : undefined}
              className={`inline-flex min-h-(--control-h) items-center rounded-xs px-4 text-[14px] font-semibold md:min-h-(--control-h-sm) ${
                filters.vista === view ? "bg-brand-blue text-white" : "text-brand-blue hover:bg-blue-20"
              }`}
            >
              {view === "kanban" ? "Kanban" : "Tabella"}
            </Link>
          ))}
        </nav>
      </div>

      <form
        method="get"
        action="/pipeline"
        aria-label="Filtra le opportunità"
        className="mt-6 grid gap-4 rounded-md border border-grey-60 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        {filters.vista !== "kanban" && <input type="hidden" name="vista" value={filters.vista} />}
        <Field id="f-parcheggio" label="Parcheggio">
          <Select id="f-parcheggio" name="parcheggio" defaultValue={filters.parcheggio ?? ""}>
            <option value="">Tutti</option>
            {parkings.map((parking) => (
              <option key={parking.id} value={parking.id}>
                {parking.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="f-responsabile" label="Responsabile">
          <Select id="f-responsabile" name="responsabile" defaultValue={filters.responsabile}>
            <option value="mie">Le mie</option>
            <option value="tutti">Tutti</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="f-fase" label="Fase">
          <Select id="f-fase" name="fase" defaultValue={filters.fase ?? ""}>
            <option value="">Tutte</option>
            {STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="f-esito" label="Esito">
          <Select id="f-esito" name="esito" defaultValue={filters.esito}>
            <option value="aperte">Aperte</option>
            <option value="vinte">Vinte</option>
            <option value="perse">Perse</option>
            <option value="tutte">Tutte</option>
          </Select>
        </Field>
        <Field id="f-prossima" label="Prossima attività">
          <Select id="f-prossima" name="prossima" defaultValue={filters.prossima ?? ""}>
            <option value="">Qualsiasi</option>
            <option value="scaduta">Scaduta</option>
            <option value="oggi">Oggi</option>
            <option value="7giorni">Entro 7 giorni</option>
            <option value="nessuna">Nessuna</option>
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            Filtra
          </Button>
        </div>
      </form>

      <div className="mt-6 flex flex-col gap-4">
        <p className="text-caption text-black-60" aria-live="polite">
          {items.length === 1 ? "1 opportunità" : `${items.length.toLocaleString("it-IT")} opportunità`}
        </p>
        {truncated && <Alert tone="warning">Sono mostrate le prime 500: restringi i filtri.</Alert>}
        {items.length === 0 ? (
          <EmptyState title="Nessuna opportunità">Cambia i filtri, per esempio responsabile &ldquo;Tutti&rdquo;.</EmptyState>
        ) : filters.vista === "kanban" ? (
          (board ?? <PipelineBoard items={items} now={now} />)
        ) : (
          <>
            {cadences.length > 0 && (
              <div className="flex flex-col gap-2 rounded-md border border-grey-60 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-caption text-black-80">Spunta le opportunità aperte, poi iscrivile a una cadenza.</p>
                <EnrollButton
                  mode="opportunities"
                  formId={SELECTION_FORM}
                  cadences={cadences}
                  names={Object.fromEntries(items.map((item) => [item.id, `${item.party} · ${item.parking}`]))}
                />
              </div>
            )}
            <Table caption="Opportunità">
              <thead>
                <tr>
                  <Th>
                    <SelectAllCheckbox formId={SELECTION_FORM} label="Seleziona tutte le opportunità mostrate" />
                  </Th>
                  <Th>Soggetto</Th>
                  <Th>Parcheggio</Th>
                  <Th>Fase</Th>
                  <Th>Responsabile</Th>
                  <Th>Prossima attività</Th>
                  <Th>Azioni</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const badge = opportunityBadge(item.fase, item.esito);
                  return (
                    <Tr key={item.id}>
                      <Td>
                        {item.esito === "aperta" && (
                          <SelectPartyCheckbox
                            formId={SELECTION_FORM}
                            partyId={item.id}
                            label={`${item.party} · ${item.parking}`}
                            name="opportunita"
                          />
                        )}
                      </Td>
                      <Td wrap>
                        <Link href={`/opportunita/${item.id}`} className="rounded-xs font-semibold text-blue-ink underline-offset-2 hover:underline">
                          {item.party}
                        </Link>
                        <CadenceLine cadenza={item.cadenza} />
                      </Td>
                      <Td>{item.parking}</Td>
                      <Td>
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </Td>
                      <Td>{item.responsabile ?? "–"}</Td>
                      <Td wrap>{item.esito === "aperta" ? <NextActivity item={item} now={now} /> : "–"}</Td>
                      <Td>
                        {item.esito === "aperta" && (
                          <ActivityButton opportunityId={item.id} partyId={item.partyId} subject={`${item.party} · ${item.parking}`} />
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </>
        )}
      </div>
    </>
  );
}

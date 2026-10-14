import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { PARTY_CATEGORIES, PARTY_TYPE_LABELS, partyName, type PartyType } from "@/lib/parties/labels";
import { PAGE_SIZE, type ParkingFilterOption, type PartyFilters, type PartyListItem } from "@/lib/parties/queries";
import { opportunityBadge } from "@/lib/pipeline/labels";
import { DataStatusBadge, DoNotContactBadge } from "./data-status-badge";

export function listHref(filters: PartyFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.tipo) params.set("tipo", filters.tipo);
  if (filters.categoria) params.set("categoria", filters.categoria);
  if (filters.citta) params.set("citta", filters.citta);
  if (filters.soloDaVerificare) params.set("da_verificare", "1");
  filters.parcheggi.forEach((id) => params.append("parcheggio", id));
  if (filters.senzaParcheggio) params.append("parcheggio", "nessuno");
  if (filters.ordina) params.set("ordina", filters.ordina);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `/soggetti?${query}` : "/soggetti";
}

// Sort by car park: ascending, descending, then back to the default order.
function nextSort(current: PartyFilters["ordina"]): PartyFilters["ordina"] {
  return current === null ? "parcheggio" : current === "parcheggio" ? "parcheggio_desc" : null;
}

export function PartyList({
  items,
  total,
  filters,
  parkings,
}: {
  items: PartyListItem[];
  total: number;
  filters: PartyFilters;
  parkings: ParkingFilterOption[];
}) {
  const parkingCount = filters.parcheggi.length + (filters.senzaParcheggio ? 1 : 0);
  const filtered = Boolean(filters.q || filters.tipo || filters.categoria || filters.citta || filters.soloDaVerificare || parkingCount > 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h2 leading-tight font-semibold">Soggetti</h1>
          <p className="mt-2 text-body text-black-60">Aziende e persone, con sedi, contatti e provenienza dei dati.</p>
        </div>
        <ButtonLink href="/soggetti/nuovo" variant="primary" size="md">
          Nuovo soggetto
        </ButtonLink>
      </div>

      <form
        method="get"
        action="/soggetti"
        role="search"
        aria-label="Cerca soggetti"
        className="mt-6 grid gap-4 rounded-md border border-grey-60 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]"
      >
        <div className="sm:col-span-2 lg:col-span-1">
          <Field id="q" label="Cerca" hint="Nome anche approssimato, P.IVA, telefono o sito.">
            <Input id="q" name="q" type="search" defaultValue={filters.q} autoComplete="off" hasDescription />
          </Field>
        </div>
        <Field id="tipo" label="Tipo">
          <Select id="tipo" name="tipo" defaultValue={filters.tipo ?? ""}>
            <option value="">Tutti</option>
            {(Object.keys(PARTY_TYPE_LABELS) as PartyType[]).map((type) => (
              <option key={type} value={type}>
                {PARTY_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="categoria" label="Categoria">
          <Select id="categoria" name="categoria" defaultValue={filters.categoria ?? ""}>
            <option value="">Tutte</option>
            {PARTY_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="citta" label="Città">
          <Input id="citta" name="citta" defaultValue={filters.citta} autoComplete="off" />
        </Field>
        <fieldset className="sm:col-span-2 lg:col-span-4">
          <details className="group rounded-sm border border-grey-60" open={parkingCount > 0}>
            <summary className="flex min-h-(--control-h) cursor-pointer items-center justify-between gap-2 px-3 text-[14px] font-semibold md:min-h-(--control-h-sm)">
              <span>
                Parcheggio{parkingCount > 0 ? ` (${parkingCount} ${parkingCount === 1 ? "scelto" : "scelti"})` : ": tutti"}
              </span>
              <span aria-hidden="true" className="text-black-60 group-open:rotate-180">▾</span>
            </summary>
            <legend className="sr-only">Parcheggio</legend>
            <div className="grid gap-x-6 gap-y-2 border-t border-grey-60 p-3 sm:grid-cols-2 lg:grid-cols-3">
              {parkings.map((parking) => (
                <Checkbox
                  key={parking.id}
                  name="parcheggio"
                  value={parking.id}
                  defaultChecked={filters.parcheggi.includes(parking.id)}
                  label={parking.nome}
                />
              ))}
              <Checkbox name="parcheggio" value="nessuno" defaultChecked={filters.senzaParcheggio} label={<em>Nessun parcheggio</em>} />
            </div>
          </details>
        </fieldset>
        {filters.ordina && <input type="hidden" name="ordina" value={filters.ordina} />}
        <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-2 lg:col-span-4">
          <Checkbox name="da_verificare" value="1" defaultChecked={filters.soloDaVerificare} label="Solo con dati da verificare" />
          <Button type="submit" size="md">
            Cerca
          </Button>
        </div>
      </form>

      <div className="mt-6 flex flex-col gap-4">
        {items.length === 0 ? (
          filtered ? (
            <EmptyState title="Nessun soggetto trovato">Prova con un nome più corto o togli qualche filtro.</EmptyState>
          ) : (
            <EmptyState title="Nessun soggetto">Inserisci il primo soggetto con il pulsante &ldquo;Nuovo soggetto&rdquo;.</EmptyState>
          )
        ) : (
          <>
            <p className="text-caption text-black-60" aria-live="polite">
              {total === 1 ? "1 soggetto" : `${total.toLocaleString("it-IT")} soggetti`}
              {filters.q && " — i più simili alla ricerca per primi"}
            </p>
            <Table caption="Elenco dei soggetti">
              <thead>
                <tr>
                  <Th>Nome</Th>
                  <Th>
                    <Link
                      href={listHref({ ...filters, ordina: nextSort(filters.ordina) }, 1)}
                      className="rounded-xs uppercase underline-offset-2 hover:underline"
                      aria-label={`Ordina per parcheggio${filters.ordina === "parcheggio" ? ", ora dalla A alla Z" : filters.ordina === "parcheggio_desc" ? ", ora dalla Z alla A" : ""}`}
                    >
                      Parcheggi {filters.ordina === "parcheggio" ? "↑" : filters.ordina === "parcheggio_desc" ? "↓" : ""}
                    </Link>
                  </Th>
                  <Th>Tipo</Th>
                  <Th>Categoria</Th>
                  <Th>Città</Th>
                  <Th>Telefono</Th>
                  <Th>Stato dei dati</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <Tr key={item.id}>
                    <Td wrap>
                      <span className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/soggetti/${item.id}`}
                          className="rounded-xs font-semibold text-blue-ink underline-offset-2 hover:underline"
                        >
                          {partyName(item)}
                        </Link>
                        {item.non_contattare && <DoNotContactBadge />}
                        {filters.q && item.somiglianza !== null && item.somiglianza < 1 && item.somiglianza >= 0.3 && (
                          <Badge tone="info">Nome simile</Badge>
                        )}
                      </span>
                    </Td>
                    <Td wrap>
                      {item.parcheggi.length === 0 ? (
                        <span className="text-black-60">–</span>
                      ) : (
                        <ul className="flex min-w-44 flex-col gap-1">
                          {item.parcheggi.map((parking) => {
                            const badge = opportunityBadge(parking.fase, parking.esito);
                            return (
                              <li key={parking.opportunity_id} className="flex flex-wrap items-center gap-2">
                                <Link href={`/opportunita/${parking.opportunity_id}`} className="rounded-xs font-semibold underline-offset-2 hover:underline">
                                  {parking.parcheggio}
                                </Link>
                                <Badge tone={badge.tone}>{badge.label}</Badge>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </Td>
                    <Td>{PARTY_TYPE_LABELS[item.tipo]}</Td>
                    <Td>{item.categoria ?? "–"}</Td>
                    <Td>{item.citta ?? "–"}</Td>
                    <Td>{item.telefono ?? "–"}</Td>
                    <Td>
                      <DataStatusBadge verified={item.campi_verificati} valued={item.campi_valorizzati} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={filters.page} pageCount={pageCount} hrefFor={(page) => listHref(filters, page)} />
          </>
        )}
      </div>
    </>
  );
}

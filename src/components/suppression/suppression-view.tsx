import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import {
  OPPOSITION_CHANNEL_LABELS,
  SUPPRESSION_TYPES,
  SUPPRESSION_TYPE_LABELS,
  isOppositionChannel,
} from "@/lib/suppression/labels";
import { SUPPRESSION_PAGE_SIZE, suppressionHref, type SuppressionEntry, type SuppressionFilters } from "@/lib/suppression/queries";
import { AddSuppressionForm, RemoveSuppressionButton } from "./suppression-controls";

// /esclusioni (C2): everyone reads; administrators add and remove.
export function SuppressionView({
  items,
  total,
  filters,
  isAdmin,
}: {
  items: SuppressionEntry[];
  total: number;
  filters: SuppressionFilters;
  isAdmin: boolean;
}) {
  const pageCount = Math.max(1, Math.ceil(total / SUPPRESSION_PAGE_SIZE));
  return (
    <>
      <h1 className="text-h2 leading-tight font-semibold">Lista di esclusione</h1>
      <p className="mt-2 max-w-3xl text-body text-black-60">
        Chi è qui non riceve email e non rientra con gli import da file o dalla mappa. Le voci nascono da &ldquo;Non
        contattare&rdquo;, da una cancellazione GDPR o a mano.
        {!isAdmin && " Solo l'amministratore aggiunge o rimuove voci da questa pagina."}
      </p>

      {isAdmin && (
        <section aria-labelledby="aggiungi-titolo" className="mt-6 rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
          <h2 id="aggiungi-titolo" className="text-h4 font-semibold">
            Aggiungi a mano
          </h2>
          <div className="mt-4">
            <AddSuppressionForm />
          </div>
        </section>
      )}

      <form
        method="get"
        action="/esclusioni"
        role="search"
        aria-label="Cerca nella lista di esclusione"
        className="mt-6 grid gap-4 rounded-md border border-grey-60 bg-white p-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
      >
        <Field id="q" label="Cerca" hint="Parte del valore, per esempio il dominio.">
          <Input id="q" name="q" type="search" defaultValue={filters.q} autoComplete="off" hasDescription />
        </Field>
        <Field id="tipo" label="Tipo">
          <Select id="tipo" name="tipo" defaultValue={filters.tipo ?? ""}>
            <option value="">Tutti</option>
            {SUPPRESSION_TYPES.map((type) => (
              <option key={type} value={type}>
                {SUPPRESSION_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" size="md">
          Cerca
        </Button>
        <div className="sm:col-span-3">
          <Checkbox name="rimosse" value="1" defaultChecked={filters.rimosse} label="Mostra anche le voci rimosse" />
        </div>
      </form>

      <div className="mt-6 flex flex-col gap-4">
        {items.length === 0 ? (
          <EmptyState title="Nessuna voce">
            {filters.q || filters.tipo ? "Nessuna voce con questi filtri." : "La lista di esclusione è vuota."}
          </EmptyState>
        ) : (
          <>
            <p className="text-caption text-black-60">{total === 1 ? "1 voce" : `${total.toLocaleString("it-IT")} voci`}</p>
            <Table caption="Voci della lista di esclusione">
              <thead>
                <tr>
                  <Th>Valore</Th>
                  <Th>Tipo</Th>
                  <Th>Motivo</Th>
                  <Th>Da dove</Th>
                  <Th>Aggiunta</Th>
                  <Th>Stato</Th>
                  {isAdmin && (
                    <Th>
                      <span className="sr-only">Azioni</span>
                    </Th>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <Tr key={item.id}>
                    <Td wrap>
                      {item.valore ?? <em className="text-black-60">Dato cancellato (GDPR)</em>}
                    </Td>
                    <Td>{SUPPRESSION_TYPE_LABELS[item.tipo]}</Td>
                    <Td wrap>{item.motivo ?? "–"}</Td>
                    <Td>{isOppositionChannel(item.canale) ? OPPOSITION_CHANNEL_LABELS[item.canale] : "–"}</Td>
                    <Td wrap>
                      {formatDate(item.creataIl)}
                      <span className="block text-caption text-black-60">{item.autore ?? "Sistema"}</span>
                    </Td>
                    <Td wrap>
                      {item.rimossaIl ? (
                        <>
                          <Badge tone="neutral">Rimossa</Badge>
                          <span className="mt-1 block text-caption text-black-80">
                            {formatDate(item.rimossaIl)}, {item.rimossaDa ?? "–"}: {item.motivoRimozione}
                          </span>
                        </>
                      ) : item.gdpr ? (
                        <Badge tone="info">Cancellazione GDPR</Badge>
                      ) : (
                        <Badge tone="critical">Attiva</Badge>
                      )}
                    </Td>
                    {isAdmin && (
                      <Td>
                        {!item.rimossaIl && !item.gdpr && <RemoveSuppressionButton id={item.id} label={item.valore ?? "voce"} />}
                      </Td>
                    )}
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={filters.page} pageCount={pageCount} hrefFor={(page) => suppressionHref(filters, page)} />
          </>
        )}
      </div>
    </>
  );
}

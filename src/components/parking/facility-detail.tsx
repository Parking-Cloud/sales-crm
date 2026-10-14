import Link from "next/link";
import { NotesCard } from "@/components/notes-card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Select } from "@/components/ui/field";
import { formatDate, formatNumber } from "@/lib/format";
import { OSM_ATTRIBUTION, OSM_COPYRIGHT_URL } from "@/lib/geo/osm-attribution";
import { googleMapsPlaceUrl } from "@/lib/google/maps-link";
import { facilityAddress } from "@/lib/parking/validation";
import { seatsExceeded, subscriptionSeats } from "@/lib/parking/capacity";
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_STATUS_TONES, PARKING_TYPE_LABELS } from "@/lib/parking/labels";
import type { Facility, Product } from "@/lib/parking/queries";
import { PRODUCT_TEMPLATES } from "@/lib/parking/templates";
import { ArchiveControl } from "./archive-control";
import { ProductTable } from "./product-table";

const COORDINATE = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 6, maximumFractionDigits: 6 });

const COORDINATE_SOURCE_LABELS: Record<string, string> = {
  nominatim: "OpenStreetMap",
  manuale: "Inserite a mano",
  google: "Google",
};

function coordinateSourceLabel(source: string | null): string {
  return source ? (COORDINATE_SOURCE_LABELS[source] ?? source) : "Non indicata";
}

function Card({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id ? `${id}-titolo` : undefined} id={id} className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
      <h2 id={id ? `${id}-titolo` : undefined} className="text-h4 font-semibold">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-label font-semibold tracking-[0.08em] text-black-60 uppercase">{label}</dt>
      <dd className="text-body break-words">{children}</dd>
    </div>
  );
}

export function FacilityDetail({
  facility,
  products,
  isAdmin,
  archiveDialogOpen = false,
}: {
  facility: Facility;
  products: Product[];
  isAdmin: boolean;
  archiveDialogOpen?: boolean;
}) {
  const archived = facility.archived_at !== null;
  const seats = subscriptionSeats(products);
  const hasCoordinates = facility.lat !== null && facility.lng !== null;
  const cityLine = [facility.cap, facility.citta].filter(Boolean).join(" ");
  const mapsUrl = googleMapsPlaceUrl({ name: facility.nome, address: facilityAddress(facility) });

  return (
    <>
      <p className="text-caption">
        <Link href="/parcheggi" className="rounded-xs text-blue-ink underline underline-offset-2">
          Parcheggi
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h2 leading-tight font-semibold break-words">{facility.nome}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={CAMPAIGN_STATUS_TONES[facility.stato_campagna]}>
              Campagna: {CAMPAIGN_STATUS_LABELS[facility.stato_campagna]}
            </Badge>
            {archived && (
              <Badge tone="neutral" icon="archive">
                Archiviato il {formatDate(facility.archived_at)}
              </Badge>
            )}
          </div>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/parcheggi/${facility.id}/modifica`}>Modifica</ButtonLink>
            <ArchiveControl
              facilityId={facility.id}
              facilityName={facility.nome}
              archived={archived}
              initiallyOpen={archiveDialogOpen}
            />
          </div>
        )}
      </div>

      {archived && (
        <Alert tone="info" className="mt-6">
          Questo parcheggio è archiviato: non compare nell&apos;elenco, ma i dati restano salvati.
        </Alert>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card title="Dati del parcheggio">
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Detail label="Tipo">{PARKING_TYPE_LABELS[facility.tipo]}</Detail>
            <Detail label="Indirizzo">
              {facility.indirizzo ?? "–"}
              {cityLine && <span className="block">{cityLine}</span>}
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block rounded-xs font-semibold text-blue-ink underline underline-offset-2"
                >
                  Apri in Google Maps<span className="sr-only"> (si apre in una nuova scheda)</span>
                </a>
              )}
            </Detail>
            <Detail label="Capacità totale">{formatNumber(facility.capacita)}</Detail>
            <Detail label="Posti commercializzabili">{formatNumber(facility.posti_commerciali)}</Detail>
            <Detail label="Raggio di ricerca">
              {facility.raggio_m === null ? "–" : `${formatNumber(facility.raggio_m)} m`}
            </Detail>
            <Detail label="Responsabile">{facility.responsabile ?? "–"}</Detail>
            <Detail label="Ultima modifica">{formatDate(facility.updated_at)}</Detail>
          </dl>
        </Card>

        <Card title="Coordinate">
          {hasCoordinates ? (
            <>
              <dl className="grid grid-cols-2 gap-4">
                <Detail label="Latitudine">{COORDINATE.format(facility.lat!)}</Detail>
                <Detail label="Longitudine">{COORDINATE.format(facility.lng!)}</Detail>
                <Detail label="Fonte">{coordinateSourceLabel(facility.coordinate_fonte)}</Detail>
                <Detail label="Aggiornate il">{formatDate(facility.coordinate_aggiornate_il)}</Detail>
              </dl>
              {facility.coordinate_fonte === "nominatim" && (
                <p className="mt-4 text-caption text-black-60">
                  <a
                    href={OSM_COPYRIGHT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xs underline underline-offset-2"
                  >
                    {OSM_ATTRIBUTION}
                    <span className="sr-only"> (si apre in una nuova scheda)</span>
                  </a>
                </p>
              )}
            </>
          ) : (
            <p className="text-body text-black-60">
              Coordinate non inserite.
              {isAdmin && " Aggiungile modificando il parcheggio."}
            </p>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <NotesCard
          entita="parking_facilities"
          id={facility.id}
          note={facility.note}
          author={facility.note_autore ?? null}
          updatedAt={facility.note_modificate_il}
        />
      </div>

      <section id="listino" aria-labelledby="listino-titolo" className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="listino-titolo" className="text-h3 font-semibold">
              Listino
            </h2>
            <p className="mt-1 text-body text-black-60">
              Il prezzo lordo è calcolato da prezzo netto e IVA.
            </p>
          </div>
          {isAdmin && (
            <div className="flex flex-wrap items-end gap-3">
              <form method="get" action={`/parcheggi/${facility.id}/prodotti/nuovo`} className="flex flex-wrap items-end gap-2">
                <div className="w-52">
                  <Field id="modello" label="Modello">
                    <Select id="modello" name="modello" defaultValue={PRODUCT_TEMPLATES[0].key}>
                      {PRODUCT_TEMPLATES.map((template) => (
                        <option key={template.key} value={template.key}>
                          {template.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Button type="submit">Aggiungi da modello</Button>
              </form>
              <ButtonLink href={`/parcheggi/${facility.id}/prodotti/nuovo`} variant="primary">
                Aggiungi prodotto
              </ButtonLink>
            </div>
          )}
        </div>

        {seatsExceeded(facility.posti_commerciali, seats) && (
          <Alert tone="warning" title="Posti in abbonamento oltre la disponibilità" className="mt-4">
            I prodotti in abbonamento attivi offrono {formatNumber(seats)} posti, ma i posti
            commercializzabili sono {formatNumber(facility.posti_commerciali)}. Puoi salvare
            comunque: controlla le disponibilità prima di inviare offerte.
          </Alert>
        )}

        <div className="mt-4">
          {products.length === 0 ? (
            <EmptyState title="Nessun prodotto in listino">
              {isAdmin
                ? "Aggiungi un prodotto oppure parti da un modello."
                : "L'amministratore non ha ancora inserito prodotti per questo parcheggio."}
            </EmptyState>
          ) : (
            <ProductTable parkingId={facility.id} products={products} isAdmin={isAdmin} />
          )}
        </div>
      </section>
    </>
  );
}

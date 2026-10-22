import Link from "next/link";
import { PeriodFields } from "@/components/analytics/period-fields";
import { WeeklyChart, weekLabel } from "@/components/analytics/weekly-chart";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import {
  acceptanceRate,
  COUNT_LABELS,
  countEvents,
  EVENT_TYPES,
  parkingCities,
  parkingRows,
  SHORT_LABELS,
  TRANSITIONS,
  weeklyCounts,
  type AnalyticsEvent,
  type AnalyticsFilters,
  type AnalyticsParking,
} from "@/lib/analytics/aggregate";
import type { Period } from "@/lib/analytics/period";
import { formatDate, formatNumber } from "@/lib/format";

const PERCENT = new Intl.NumberFormat("it-IT", { style: "percent", maximumFractionDigits: 1 });

function formatRate(rate: number | null) {
  return rate === null ? "–" : PERCENT.format(rate);
}

// Analytics (block 1a-10): what happened in a period, counted on the date of
// each change (audit), with the car park, city and owner filters. The page
// reads the data; this draws it (also used by previews and end-to-end tests).
export function AnalyticsView({
  period,
  filters,
  events,
  parkings,
  users,
}: {
  period: Period;
  filters: AnalyticsFilters;
  events: AnalyticsEvent[];
  parkings: AnalyticsParking[];
  users: { id: string; nome: string }[];
}) {
  const counts = countEvents(events);
  const rate = acceptanceRate(counts);
  const weeks = weeklyCounts(events, period.da, period.a);
  const rows = parkingRows(events, parkings);
  const cities = parkingCities(parkings);
  const filtered = Boolean(filters.parcheggio || filters.citta || filters.responsabile) || period.preset !== "questo_mese";

  const tiles: { label: string; value: string; hint?: string }[] = [
    ...EVENT_TYPES.map((tipo) => ({ label: COUNT_LABELS[tipo], value: formatNumber(counts[tipo]) })),
    { label: "Tasso di accettazione", value: formatRate(rate), hint: "Accettate su inviate nel periodo" },
  ];

  return (
    <>
      <h1 className="text-h2 leading-tight font-semibold">Analytics</h1>
      <p className="mt-2 max-w-3xl text-body text-black-60">
        Quello che è successo nel periodo, contato alla data di ogni cambio di stato (dallo storico), non sullo stato di oggi. Un prospect
        conta una volta; un&apos;offerta una volta per parcheggio.
      </p>

      <form method="get" className="mt-6 grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]" aria-label="Filtri">
        <PeriodFields preset={period.preset} da={period.da} a={period.a} />
        <Field id="analytics-parcheggio" label="Parcheggio">
          <Select id="analytics-parcheggio" name="parcheggio" defaultValue={filters.parcheggio ?? ""}>
            <option value="">Tutti</option>
            {parkings.map((parking) => (
              <option key={parking.id} value={parking.id}>
                {parking.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="analytics-citta" label="Città del parcheggio">
          <Select id="analytics-citta" name="citta" defaultValue={filters.citta ?? ""}>
            <option value="">Tutte</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="analytics-responsabile" label="Responsabile">
          <Select id="analytics-responsabile" name="responsabile" defaultValue={filters.responsabile ?? ""}>
            <option value="">Tutti</option>
            {users.map((option) => (
              <option key={option.id} value={option.id}>
                {option.nome}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary">
            Mostra
          </Button>
          {filtered && (
            <Link href="/analytics" className={buttonClasses("ghost")}>
              Togli i filtri
            </Link>
          )}
        </div>
      </form>

      {period.error && (
        <Alert tone="warning" className="mt-4">
          {period.error} Mostro questo mese.
        </Alert>
      )}

      <p className="mt-6 text-body text-black-80" aria-live="polite">
        Dal {formatDate(period.da)} al {formatDate(period.a)}
        {filters.parcheggio || filters.citta ? " · parcheggi filtrati: i prospect senza parcheggio non sono contati" : ""}
        {filters.responsabile ? " · solo i lead del responsabile scelto" : ""}
      </p>

      <ul aria-label="Numeri del periodo" className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => (
          <li key={tile.label} className="flex flex-col gap-1 rounded-md border border-grey-60 bg-white p-4">
            <span className="text-caption leading-snug text-black-60">{tile.label}</span>
            <span className="text-h2 leading-tight font-semibold text-brand-black tabular-nums">{tile.value}</span>
            {tile.hint && <span className="text-caption leading-snug text-black-60">{tile.hint}</span>}
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-h4 leading-tight font-semibold">Cambi di stato per settimana</h2>
      <p className="mt-1 text-caption text-black-60">Settimane da lunedì a domenica; la prima e l&apos;ultima sono tagliate al periodo.</p>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {TRANSITIONS.map((tipo) => (
          <WeeklyChart key={tipo} title={COUNT_LABELS[tipo]} weeks={weeks} value={(week) => week.counts[tipo]} />
        ))}
      </div>
      <details className="mt-3">
        <summary className="inline-flex min-h-(--control-h) cursor-pointer items-center rounded-sm text-[14px] font-semibold text-brand-blue md:min-h-(--control-h-sm)">
          Mostra i numeri per settimana in tabella
        </summary>
        <div className="mt-2">
          <Table caption="Cambi di stato per settimana">
            <thead>
              <tr>
                <Th>Settimana</Th>
                {TRANSITIONS.map((tipo) => (
                  <Th key={tipo} align="end">
                    {SHORT_LABELS[tipo]}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <Tr key={week.da}>
                  <Td>{weekLabel(week)}</Td>
                  {TRANSITIONS.map((tipo) => (
                    <Td key={tipo} align="end">
                      {formatNumber(week.counts[tipo])}
                    </Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </details>

      <h2 className="mt-8 text-h4 leading-tight font-semibold">Per parcheggio</h2>
      <p className="mt-1 text-caption text-black-60">
        Gli stessi numeri per ogni parcheggio con almeno un evento nel periodo. Un prospect su più parcheggi conta in ognuno.
      </p>
      <div className="mt-3">
        {rows.length === 0 ? (
          <p className="rounded-md border border-grey-60 bg-white p-4 text-body text-black-60">Nessun evento nel periodo: tutti i numeri sono zero.</p>
        ) : (
          <Table caption="Numeri per parcheggio">
            <thead>
              <tr>
                <Th>Parcheggio</Th>
                <Th>Città</Th>
                {EVENT_TYPES.map((tipo) => (
                  <Th key={tipo} align="end">
                    {SHORT_LABELS[tipo]}
                  </Th>
                ))}
                <Th align="end">Tasso</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.parkingId ?? "nessuno"}>
                  <Td wrap>{row.nome}</Td>
                  <Td>{row.citta ?? "–"}</Td>
                  {EVENT_TYPES.map((tipo) => (
                    <Td key={tipo} align="end">
                      {formatNumber(row.counts[tipo])}
                    </Td>
                  ))}
                  <Td align="end">{formatRate(row.tasso)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </>
  );
}

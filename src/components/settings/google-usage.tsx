import { ApiLimitsForm } from "@/components/settings/api-limits-form";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { formatNumber } from "@/lib/format";
import type { MonthUsage } from "@/lib/places/queries";
import { SKUS } from "@/lib/settings/api-limits";
import type { ApiLimits } from "@/lib/settings/queries";

const MONTH = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "Europe/Rome" });

// /impostazioni: daily limits of Google calls (admin) and this month's use by SKU.
export function GoogleUsageSection({ isAdmin, limits, usage }: { isAdmin: boolean; limits: ApiLimits; usage: MonthUsage[] }) {
  const used = new Map(usage.map((row) => [row.sku, row.chiamate]));
  return (
    <section
      aria-labelledby="google-titolo"
      className="mt-6 max-w-3xl rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6"
    >
      <h2 id="google-titolo" className="text-h4 font-semibold">
        Chiamate a Google
      </h2>
      <p className="mt-2 text-body text-black-80">
        Ogni ricerca su mappa, import e distanza a piedi usa servizi Google a pagamento oltre una quota gratuita mensile.
        I limiti giornalieri bloccano ricerche e import quando vengono superati.
      </p>
      <div className="mt-4">
        {isAdmin ? (
          <ApiLimitsForm limits={limits} />
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2">
            {[
              ["Ricerche al giorno", limits.nearby],
              ["Dettagli al giorno", limits.details],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col gap-1">
                <dt className="text-label font-semibold tracking-[0.08em] text-black-60 uppercase">{label}</dt>
                <dd className="text-body font-semibold tabular-nums">{formatNumber(Number(value))}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <h3 className="mt-6 text-body font-semibold">Uso di {MONTH.format(new Date())}</h3>
      <div className="mt-2">
        <Table caption={`Chiamate a Google di ${MONTH.format(new Date())} per servizio`}>
          <thead>
            <tr>
              <Th>Servizio</Th>
              <Th align="end">Questo mese</Th>
              <Th align="end">Gratis al mese</Th>
            </tr>
          </thead>
          <tbody>
            {SKUS.map((sku) => (
              <Tr key={sku.sku}>
                <Td wrap>{sku.label}</Td>
                <Td align="end">
                  {formatNumber(used.get(sku.sku) ?? 0)} {sku.unit}
                </Td>
                <Td align="end">{formatNumber(sku.freePerMonth)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <p className="mt-2 text-caption text-black-60">
        {!isAdmin && "Solo l'amministratore può modificare i limiti. "}
        Quote gratuite dal listino Google Maps Platform letto il 9 ottobre 2026.
      </p>
    </section>
  );
}

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";
import type { Batch } from "@/lib/import/queries";

export function BatchHistory({ batches }: { batches: Batch[] }) {
  return (
    <section aria-labelledby="storico" className="flex flex-col gap-4">
      <h2 id="storico" className="text-h3 font-semibold">
        Import fatti
      </h2>
      {batches.length === 0 ? (
        <EmptyState title="Nessun import">Gli import fatti dall&apos;amministratore compaiono qui.</EmptyState>
      ) : (
        <Table caption="Storico degli import">
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>File</Th>
              <Th>Fatto da</Th>
              <Th align="end">Righe</Th>
              <Th align="end">Nuovi soggetti</Th>
              <Th>Stato</Th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => (
              <Tr key={batch.id}>
                <Td>
                  <Link href={`/import/${batch.id}`} className="rounded-xs font-semibold text-blue-ink underline-offset-2 hover:underline">
                    {formatDate(batch.created_at)}
                  </Link>
                </Td>
                <Td wrap>{batch.file}</Td>
                <Td>{batch.utente ?? "–"}</Td>
                <Td align="end">{formatNumber(batch.conteggi.righe ?? null)}</Td>
                <Td align="end">{formatNumber(batch.conteggi.nuovi_soggetti ?? null)}</Td>
                <Td>
                  {batch.annullato_il ? (
                    <Badge tone="neutral">Annullato il {formatDate(batch.annullato_il)}</Badge>
                  ) : (
                    <Badge tone="success">Importato</Badge>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}

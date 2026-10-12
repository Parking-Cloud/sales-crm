import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { formatEuro, formatNumber, grossPrice } from "@/lib/format";
import { PRODUCT_PERIOD_LABELS, PRODUCT_TYPE_LABELS, formatTimeBand } from "@/lib/parking/labels";
import type { Product } from "@/lib/parking/queries";

function formatVat(value: number | null) {
  return value === null ? "–" : `${formatNumber(value)}%`;
}

export function ProductTable({
  parkingId,
  products,
  isAdmin,
}: {
  parkingId: string;
  products: Product[];
  isAdmin: boolean;
}) {
  return (
    <Table caption="Listino del parcheggio">
      <thead>
        <tr>
          <Th>Prodotto</Th>
          <Th>Tipo</Th>
          <Th>Giorni</Th>
          <Th>Fascia oraria</Th>
          <Th>Periodo</Th>
          <Th align="end">Prezzo netto</Th>
          <Th align="end">IVA</Th>
          <Th align="end">Prezzo lordo</Th>
          <Th align="end">Posti</Th>
          <Th>Stato</Th>
          {isAdmin && (
            <Th>
              <span className="sr-only">Azioni</span>
            </Th>
          )}
        </tr>
      </thead>
      <tbody>
        {products.map((product) => (
          <Tr key={product.id}>
            <Td wrap>
              <span className="font-semibold">{product.nome}</span>
              {product.note && <span className="mt-0.5 block text-caption text-black-60">{product.note}</span>}
            </Td>
            <Td>{PRODUCT_TYPE_LABELS[product.tipo]}</Td>
            <Td>{product.giorni ?? "–"}</Td>
            <Td>{formatTimeBand(product.ora_da, product.ora_a)}</Td>
            <Td>{product.periodo ? PRODUCT_PERIOD_LABELS[product.periodo] : "–"}</Td>
            <Td align="end">{formatEuro(product.prezzo_netto)}</Td>
            <Td align="end">{formatVat(product.iva_pct)}</Td>
            <Td align="end">
              <span className="font-semibold">{formatEuro(grossPrice(product.prezzo_netto, product.iva_pct))}</span>
            </Td>
            <Td align="end">{formatNumber(product.posti_disponibili)}</Td>
            <Td>
              {product.attivo ? <Badge tone="success">Attivo</Badge> : <Badge tone="neutral">Non attivo</Badge>}
            </Td>
            {isAdmin && (
              <Td>
                <Link
                  href={`/parcheggi/${parkingId}/prodotti/${product.id}/modifica`}
                  className="rounded-xs font-semibold text-blue-ink underline underline-offset-2"
                >
                  Modifica<span className="sr-only"> {product.nome}</span>
                </Link>
              </Td>
            )}
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

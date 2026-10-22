import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CsvExportButton } from "@/components/parties/csv-export";
import { BulkAddToParking } from "@/components/pipeline/add-to-parking";
import { ProspectTable } from "@/components/prospect/prospect-table";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { listParkingFilterOptions } from "@/lib/parties/queries";
import { listParkingOptions } from "@/lib/pipeline/queries";
import { listProspects, PROSPECT_FILTERS, PROSPECT_SORTS } from "@/lib/prospect/queries";
import { readTableQuery } from "@/lib/tables/query";

export const metadata: Metadata = { title: "Prospect" };

const SELECTION_FORM = "selezione-prospect";

// Prospect (block 1a-9): the companies found on the map and those already
// in the CRM, worked from the table.
export default async function ProspectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  const params = await searchParams;
  const query = readTableQuery(params, PROSPECT_FILTERS, PROSPECT_SORTS);
  const [{ rows, total }, parkings, activeParkings] = await Promise.all([listProspects(query), listParkingFilterOptions(), listParkingOptions()]);
  const filtri = Object.fromEntries(Object.entries(query.filters));

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h2 leading-tight font-semibold">Prospect</h1>
          <p className="mt-2 max-w-3xl text-body text-black-60">
            Le aziende trovate sulla mappa e quelle già nel CRM. Clicca una cella per modificarla: si salva con Invio o uscendo dalla cella.
          </p>
        </div>
        <ButtonLink href="/prospect/nuovo" variant="primary" size="md">
          Nuovo prospect
        </ButtonLink>
      </div>
      <div className="mt-6 flex flex-col gap-4">
        <BulkAddToParking
          formId={SELECTION_FORM}
          parkings={activeParkings}
          names={Object.fromEntries(rows.map((row) => [row.id, row.nome]))}
          extra={<CsvExportButton key="esporta" formId={SELECTION_FORM} filtri={filtri} total={total} />}
        />
        <ProspectTable rows={rows} total={total} query={query} parkings={parkings} activeParkings={activeParkings} selectionFormId={SELECTION_FORM} />
      </div>
    </>
  );
}

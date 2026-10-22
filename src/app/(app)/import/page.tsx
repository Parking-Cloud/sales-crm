import type { Metadata } from "next";
import { FeatureDisabled } from "@/components/feature-disabled";
import { DISABLED_FEATURES } from "@/lib/features";
import { redirect } from "next/navigation";
import { BatchHistory } from "@/components/import/batch-history";
import { ImportWizard } from "@/components/import/import-wizard";
import { Alert } from "@/components/ui/alert";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { listBatches, listMappings, listParkingOptions } from "@/lib/import/queries";

export const metadata: Metadata = { title: "Import" };

export default async function ImportPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (DISABLED_FEATURES.import) return <FeatureDisabled title="Import" />;

  const batches = await listBatches();
  const [parkings, mappings] = user.isAdmin ? await Promise.all([listParkingOptions(), listMappings()]) : [[], []];
  // Proposed destination: the Zuretti car park, when it exists.
  const zuretti = parkings.find((parking) => parking.nome.toLowerCase().includes("zuretti"));

  return (
    <>
      <h1 className="text-h2 leading-tight font-semibold">Import</h1>
      <p className="mt-2 text-body text-black-60">Carica un Excel o un CSV, controlla l&apos;anteprima e importa.</p>
      <div className="mt-6 flex flex-col gap-10">
        {user.isAdmin ? (
          <ImportWizard parkings={parkings} mappings={mappings} defaultParkingId={zuretti?.id ?? null} />
        ) : (
          <Alert tone="info" title="Sola lettura">
            Gli import li fa l&apos;amministratore. Qui vedi quelli già fatti.
          </Alert>
        )}
        <BatchHistory batches={batches} />
      </div>
    </>
  );
}

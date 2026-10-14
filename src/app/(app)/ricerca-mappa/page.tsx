import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MapSearch } from "@/components/places/map-search";
import { Alert } from "@/components/ui/alert";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { listSearchParkings } from "@/lib/places/queries";

export const metadata: Metadata = { title: "Ricerca su mappa" };

export default async function MapSearchPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  const parkings = await listSearchParkings();

  return (
    <>
      <h1 className="text-h2 leading-tight font-semibold">Ricerca su mappa</h1>
      <p className="mt-2 text-body text-black-60">
        Trova le attività vicino a un parcheggio, guarda cosa c&apos;è già nel CRM e importa solo quelle che ti interessano.
      </p>
      <div className="mt-6">
        {parkings.length === 0 ? (
          <Alert tone="info" title="Nessun parcheggio con coordinate">
            Per cercare serve un parcheggio con latitudine e longitudine: aggiungile nella scheda del parcheggio.
          </Alert>
        ) : (
          <MapSearch parkings={parkings} />
        )}
      </div>
    </>
  );
}

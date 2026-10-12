import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MaxDistanceForm } from "@/components/settings/max-distance-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { formatDate } from "@/lib/format";
import { formatKm } from "@/lib/settings/distance";
import { getMaxParkingDistance } from "@/lib/settings/queries";

export const metadata: Metadata = { title: "Impostazioni" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  const distance = await getMaxParkingDistance();

  return (
    <>
      <h1 className="mb-6 text-h2 leading-tight font-semibold">Impostazioni</h1>
      <section
        aria-labelledby="distanze-titolo"
        className="max-w-3xl rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6"
      >
        <h2 id="distanze-titolo" className="text-h4 font-semibold">
          Distanze dai parcheggi
        </h2>
        <p className="mt-2 text-body text-black-80">
          Nella scheda di un soggetto, per ogni sede si vedono solo i parcheggi attivi entro questa distanza in linea
          d&apos;aria, dal più vicino.
        </p>
        <div className="mt-4">
          {user.isAdmin ? (
            <MaxDistanceForm meters={distance.meters} />
          ) : (
            <dl className="flex flex-col gap-1">
              <dt className="text-label font-semibold tracking-[0.08em] text-black-60 uppercase">
                Distanza massima dei parcheggi mostrati
              </dt>
              <dd className="text-body font-semibold">{formatKm(distance.meters)}</dd>
            </dl>
          )}
        </div>
        {(!user.isAdmin || distance.updatedAt) && (
          <p className="mt-4 text-caption text-black-60">
            {!user.isAdmin && "Solo l'amministratore può modificarla. "}
            {distance.updatedAt && `Ultima modifica: ${formatDate(distance.updatedAt)}.`}
          </p>
        )}
      </section>
    </>
  );
}

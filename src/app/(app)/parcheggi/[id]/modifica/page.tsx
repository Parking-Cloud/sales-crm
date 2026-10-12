import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminOnly } from "@/components/parking/admin-only";
import { FacilityForm } from "@/components/parking/facility-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { getFacility, listUserOptions } from "@/lib/parking/queries";

export const metadata: Metadata = { title: "Modifica parcheggio" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function EditParkingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const facility = await getFacility(id);
  if (!facility) notFound();

  return (
    <>
      <h1 className="mb-6 text-h2 leading-tight font-semibold break-words">Modifica {facility.nome}</h1>
      {user.isAdmin ? (
        <FacilityForm facility={facility} users={await listUserOptions()} />
      ) : (
        <AdminOnly backHref={`/parcheggi/${id}`} />
      )}
    </>
  );
}

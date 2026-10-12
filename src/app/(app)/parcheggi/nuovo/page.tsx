import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminOnly } from "@/components/parking/admin-only";
import { FacilityForm } from "@/components/parking/facility-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { isGeocodingEnabled } from "@/lib/google/geocoding";
import { listUserOptions } from "@/lib/parking/queries";

export const metadata: Metadata = { title: "Nuovo parcheggio" };

export default async function NewParkingPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  return (
    <>
      <h1 className="mb-6 text-h2 leading-tight font-semibold">Nuovo parcheggio</h1>
      {user.isAdmin ? (
        <FacilityForm facility={null} users={await listUserOptions()} geocodingEnabled={isGeocodingEnabled()} />
      ) : (
        <AdminOnly backHref="/parcheggi" />
      )}
    </>
  );
}

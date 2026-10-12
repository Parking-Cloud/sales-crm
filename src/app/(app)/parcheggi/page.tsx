import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FacilityList } from "@/components/parking/facility-list";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { listFacilities, readFacilityFilters } from "@/lib/parking/queries";

export const metadata: Metadata = { title: "Parcheggi" };

export default async function ParkingListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  const filters = readFacilityFilters(await searchParams);
  const items = await listFacilities(filters);
  return <FacilityList items={items} filters={filters} isAdmin={user.isAdmin} />;
}

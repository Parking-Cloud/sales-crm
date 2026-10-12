import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { FacilityDetail } from "@/components/parking/facility-detail";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { getFacility, listProducts } from "@/lib/parking/queries";

const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const facility = UUID.test(id) ? await getFacility(id) : null;
  return { title: facility?.nome ?? "Parcheggio" };
}

export default async function ParkingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const facility = await getFacility(id);
  if (!facility) notFound();
  const products = await listProducts(id);

  return <FacilityDetail facility={facility} products={products} isAdmin={user.isAdmin} />;
}

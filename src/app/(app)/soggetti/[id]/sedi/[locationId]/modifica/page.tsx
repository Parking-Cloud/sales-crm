import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LocationForm } from "@/components/parties/location-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { partyName } from "@/lib/parties/labels";
import { getLocation, getParty } from "@/lib/parties/queries";

export const metadata: Metadata = { title: "Modifica sede" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function EditLocationPage({ params }: { params: Promise<{ id: string; locationId: string }> }) {
  if (!(await getCurrentUser())) redirect(SIGN_IN_PATH);
  const { id, locationId } = await params;
  if (!UUID.test(id) || !UUID.test(locationId)) notFound();
  const [party, location] = await Promise.all([getParty(id), getLocation(id, locationId)]);
  if (!party || !location) notFound();
  return (
    <>
      <h1 className="mb-1 text-h2 leading-tight font-semibold">Modifica sede</h1>
      <p className="mb-6 text-body text-black-60">{partyName(party)}</p>
      <LocationForm partyId={id} location={location} isFirst={false} />
    </>
  );
}

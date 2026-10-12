import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LocationForm } from "@/components/parties/location-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { partyName } from "@/lib/parties/labels";
import { getParty, listLocations } from "@/lib/parties/queries";

export const metadata: Metadata = { title: "Nuova sede" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function NewLocationPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) redirect(SIGN_IN_PATH);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const party = await getParty(id);
  if (!party) notFound();
  if (party.merged_into_id) redirect(`/soggetti/${party.merged_into_id}`);
  const locations = await listLocations(id);
  return (
    <>
      <h1 className="mb-1 text-h2 leading-tight font-semibold">Nuova sede</h1>
      <p className="mb-6 text-body text-black-60">{partyName(party)}</p>
      <LocationForm partyId={id} location={null} isFirst={locations.length === 0} />
    </>
  );
}

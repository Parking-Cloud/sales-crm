import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PartyDetail } from "@/components/parties/party-detail";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { partyName } from "@/lib/parties/labels";
import { getParty, getPartyExtras, listContacts, listDistances, listLocations, listProvenance } from "@/lib/parties/queries";
import { listPartyPermissions } from "@/lib/email/queries";
import { listTimeline } from "@/lib/pipeline/history";
import { listParkingChoices, listPartyOpportunities } from "@/lib/pipeline/queries";
import { getMaxParkingDistance } from "@/lib/settings/queries";

const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const party = UUID.test(id) ? await getParty(id) : null;
  return { title: party ? partyName(party) : "Soggetto" };
}

export default async function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const party = await getParty(id);
  if (!party) notFound();
  // A merged party's address leads to the party it was merged into.
  if (party.merged_into_id) redirect(`/soggetti/${party.merged_into_id}`);

  const maxDistance = await getMaxParkingDistance();
  const [locations, contacts, distances, extras, opportunities, parkingChoices] = await Promise.all([
    listLocations(id),
    listContacts(id),
    listDistances(id, maxDistance.meters),
    getPartyExtras(party),
    listPartyOpportunities(id),
    listParkingChoices(id),
  ]);
  const contactIds = contacts.map((contact) => contact.id);
  const [provenance, timeline, permissions] = await Promise.all([
    listProvenance(id, contactIds),
    listTimeline({ partyId: id, contactIds, locationIds: locations.map((location) => location.id) }),
    listPartyPermissions(id, contactIds),
  ]);

  return (
    <PartyDetail
      party={party}
      locations={locations}
      contacts={contacts}
      provenance={provenance}
      distances={distances}
      maxDistanceM={maxDistance.meters}
      now={Date.now()}
      placeId={extras.placeId}
      noteAuthor={extras.noteAuthor}
      opportunities={opportunities}
      parkingChoices={parkingChoices}
      permissions={permissions}
      timeline={timeline}
      isAdmin={user.isAdmin}
    />
  );
}

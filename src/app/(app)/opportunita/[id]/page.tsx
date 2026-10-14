import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { OpportunityDetail } from "@/components/pipeline/opportunity-detail";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { listTimeline } from "@/lib/pipeline/history";
import { getOpportunity, listActiveUsers, listContactOptions, listParkingProducts } from "@/lib/pipeline/queries";

const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const opportunity = UUID.test(id) ? await getOpportunity(id) : null;
  return { title: opportunity ? `${opportunity.party} · ${opportunity.parking}` : "Opportunità" };
}

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const opportunity = await getOpportunity(id);
  if (!opportunity) notFound();
  const [timeline, users, contacts, products] = await Promise.all([
    listTimeline({ partyId: opportunity.partyId, opportunityId: id }),
    listActiveUsers(),
    listContactOptions(opportunity.partyId),
    listParkingProducts(opportunity.parkingId),
  ]);
  return (
    <OpportunityDetail opportunity={opportunity} timeline={timeline} users={users} contacts={contacts} products={products} now={Date.now()} />
  );
}

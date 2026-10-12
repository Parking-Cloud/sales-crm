import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ContactForm } from "@/components/parties/contact-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { partyName } from "@/lib/parties/labels";
import { getParty, listDataSources } from "@/lib/parties/queries";

export const metadata: Metadata = { title: "Nuovo contatto" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function NewContactPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) redirect(SIGN_IN_PATH);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const party = await getParty(id);
  if (!party) notFound();
  if (party.merged_into_id) redirect(`/soggetti/${party.merged_into_id}`);
  return (
    <>
      <h1 className="mb-1 text-h2 leading-tight font-semibold">Nuovo contatto</h1>
      <p className="mb-6 text-body text-black-60">{partyName(party)}</p>
      <ContactForm partyId={id} contact={null} sources={await listDataSources()} />
    </>
  );
}

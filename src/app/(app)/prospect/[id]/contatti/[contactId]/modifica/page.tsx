import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ContactForm } from "@/components/parties/contact-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { partyName } from "@/lib/parties/labels";
import { getContact, getParty, listDataSources, listProvenance } from "@/lib/parties/queries";

export const metadata: Metadata = { title: "Modifica contatto" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function EditContactPage({ params }: { params: Promise<{ id: string; contactId: string }> }) {
  if (!(await getCurrentUser())) redirect(SIGN_IN_PATH);
  const { id, contactId } = await params;
  if (!UUID.test(id) || !UUID.test(contactId)) notFound();
  const [party, contact] = await Promise.all([getParty(id), getContact(id, contactId)]);
  if (!party || !contact) notFound();
  const [sources, provenance] = await Promise.all([listDataSources(), listProvenance(id, [contactId])]);
  return (
    <>
      <h1 className="mb-1 text-h2 leading-tight font-semibold">Modifica contatto</h1>
      <p className="mb-6 text-body text-black-60">{partyName(party)}</p>
      <ContactForm
        partyId={id}
        contact={contact}
        sources={sources}
        provenance={provenance.find((row) => row.entita === "contacts" && row.campo === "referente")}
      />
    </>
  );
}

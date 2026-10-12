import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PartyForm } from "@/components/parties/party-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { partyName } from "@/lib/parties/labels";
import { getParty, listDataSources, listProvenance } from "@/lib/parties/queries";

export const metadata: Metadata = { title: "Modifica soggetto" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function EditPartyPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) redirect(SIGN_IN_PATH);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const party = await getParty(id);
  if (!party) notFound();
  if (party.merged_into_id) redirect(`/soggetti/${party.merged_into_id}/modifica`);

  const [sources, provenance] = await Promise.all([listDataSources(), listProvenance(id, [])]);
  return (
    <>
      <h1 className="mb-6 text-h2 leading-tight font-semibold break-words">Modifica {partyName(party)}</h1>
      <PartyForm party={party} sources={sources} provenance={provenance} />
    </>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PartyForm } from "@/components/parties/party-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { listDataSources } from "@/lib/parties/queries";

export const metadata: Metadata = { title: "Nuovo soggetto" };

export default async function NewPartyPage() {
  if (!(await getCurrentUser())) redirect(SIGN_IN_PATH);
  return (
    <>
      <h1 className="mb-6 text-h2 leading-tight font-semibold">Nuovo soggetto</h1>
      <PartyForm party={null} sources={await listDataSources()} />
    </>
  );
}

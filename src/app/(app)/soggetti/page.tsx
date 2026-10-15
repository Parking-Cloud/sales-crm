import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PartyList } from "@/components/parties/party-list";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { listParkingFilterOptions, readPartyFilters, searchParties } from "@/lib/parties/queries";
import { listParkingOptions } from "@/lib/pipeline/queries";

export const metadata: Metadata = { title: "Soggetti" };

export default async function PartiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  const filters = readPartyFilters(await searchParams);
  const [{ items, total }, parkings, activeParkings] = await Promise.all([
    searchParties(filters),
    listParkingFilterOptions(),
    listParkingOptions(),
  ]);
  return <PartyList items={items} total={total} filters={filters} parkings={parkings} activeParkings={activeParkings} />;
}

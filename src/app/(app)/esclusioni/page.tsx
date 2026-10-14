import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SuppressionView } from "@/components/suppression/suppression-view";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { listSuppression, readSuppressionFilters } from "@/lib/suppression/queries";

export const metadata: Metadata = { title: "Lista di esclusione" };

export default async function SuppressionPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  const filters = readSuppressionFilters(await searchParams);
  const { items, total } = await listSuppression(filters);
  return <SuppressionView items={items} total={total} filters={filters} isAdmin={user.isAdmin} />;
}

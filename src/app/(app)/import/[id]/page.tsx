import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BatchSummary } from "@/components/import/batch-summary";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { batchRowCounts, getBatch } from "@/lib/import/queries";

export const metadata: Metadata = { title: "Riepilogo import" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const batch = await getBatch(id);
  if (!batch) notFound();
  return <BatchSummary batch={batch} remaining={await batchRowCounts(id)} isAdmin={user.isAdmin} />;
}

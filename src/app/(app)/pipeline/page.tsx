import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PipelineView } from "@/components/pipeline/pipeline-view";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { readPipelineFilters } from "@/lib/pipeline/filters";
import { listCadences } from "@/lib/cadences/queries";
import { listActiveUsers, listParkingOptions, listPipeline } from "@/lib/pipeline/queries";

export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  const filters = readPipelineFilters(await searchParams);
  const now = new Date();
  const [{ items, truncated }, parkings, users, cadences] = await Promise.all([
    listPipeline(filters, user.id, now),
    listParkingOptions(),
    listActiveUsers(),
    listCadences(),
  ]);
  return (
    <PipelineView
      items={items}
      truncated={truncated}
      filters={filters}
      parkings={parkings}
      users={users}
      now={now.getTime()}
      cadences={cadences.filter((cadence) => cadence.steps.length > 0).map((cadence) => ({ id: cadence.id, nome: cadence.nome, passi: cadence.steps.length }))}
    />
  );
}

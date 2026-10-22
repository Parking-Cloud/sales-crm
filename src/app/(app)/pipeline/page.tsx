import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PipelineTable } from "@/components/prospect/pipeline-table";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { listParkingFilterOptions } from "@/lib/parties/queries";
import { listActiveUsers } from "@/lib/pipeline/queries";
import { listPipelineRows, PIPELINE_FILTERS, PIPELINE_SORTS } from "@/lib/prospect/queries";
import { readTableQuery } from "@/lib/tables/query";

export const metadata: Metadata = { title: "Pipeline" };

// Pipeline (block 1a-9): the leads, one row per prospect + car park.
export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  const query = readTableQuery(await searchParams, PIPELINE_FILTERS, PIPELINE_SORTS);
  const [{ rows, total }, parkings, users] = await Promise.all([listPipelineRows(query, "pipeline"), listParkingFilterOptions(), listActiveUsers()]);
  return (
    <>
      <h1 className="text-h2 leading-tight font-semibold">Pipeline</h1>
      <p className="mt-2 max-w-3xl text-body text-black-60">
        I lead: ogni coppia prospect e parcheggio di un prospect Interessato o Molto interessato. Telefono, email e referente sono quelli
        del prospect.
      </p>
      <div className="mt-6">
        <PipelineTable rows={rows} total={total} query={query} parkings={parkings} users={users} />
      </div>
    </>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ReminderTable } from "@/components/prospect/pipeline-table";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { listParkingFilterOptions } from "@/lib/parties/queries";
import { listPipelineRows, REMINDER_FILTERS, REMINDER_SORTS } from "@/lib/prospect/queries";
import { readTableQuery } from "@/lib/tables/query";

export const metadata: Metadata = { title: "Promemoria" };

// Promemoria (block 1a-9, home page): leads with a reminder date, overdue
// first.
export default async function RemindersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  const query = readTableQuery(await searchParams, REMINDER_FILTERS, REMINDER_SORTS);
  const [{ rows, total }, parkings] = await Promise.all([listPipelineRows(query, "promemoria"), listParkingFilterOptions()]);
  return (
    <>
      <h1 className="text-h2 leading-tight font-semibold">Promemoria</h1>
      <p className="mt-2 max-w-3xl text-body text-black-60">
        I lead con una data di promemoria, quelli scaduti per primi. La data si sceglie in Pipeline o qui; &ldquo;Fatto&rdquo; la svuota.
      </p>
      <div className="mt-6">
        <ReminderTable rows={rows} total={total} query={query} parkings={parkings} />
      </div>
    </>
  );
}

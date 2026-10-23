import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AnalyticsView } from "@/components/analytics/analytics-view";
import { readPeriod } from "@/lib/analytics/period";
import { listAnalyticsEvents, listAnalyticsParkings, readAnalyticsFilters } from "@/lib/analytics/queries";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { romeDay } from "@/lib/pipeline/dates";
import { listActiveUsers } from "@/lib/pipeline/queries";

export const metadata: Metadata = { title: "Analytics" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

// Analytics (block 1a-10): the period and filters from the URL, the events
// of analytics_events() with the user's session.
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  const params = await searchParams;
  const period = readPeriod({ periodo: one(params.periodo), da: one(params.da), a: one(params.a) }, romeDay(new Date()));
  const filters = readAnalyticsFilters({ parcheggio: one(params.parcheggio), citta: one(params.citta), responsabile: one(params.responsabile) });
  const [events, parkings, users] = await Promise.all([listAnalyticsEvents(period.da, period.a, filters), listAnalyticsParkings(), listActiveUsers()]);
  return <AnalyticsView period={period} filters={filters} events={events} parkings={parkings} users={users} />;
}

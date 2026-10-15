import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TodayView } from "@/components/pipeline/today-view";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { dayBounds } from "@/lib/pipeline/dates";
import { listCadenceEmailSteps, prepareEmailHref } from "@/lib/cadences/queries";
import { listMyOpenTasks, listMyOpportunitiesWithoutNext } from "@/lib/pipeline/queries";
import { groupToday } from "@/lib/pipeline/today";

export const metadata: Metadata = { title: "Oggi" };

// Home page after sign-in (CRM-19).
export default async function TodayPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  const now = new Date();
  const bounds = dayBounds(now);
  const [tasks, withoutNext, emailSteps] = await Promise.all([
    listMyOpenTasks(user.id, bounds.week),
    listMyOpportunitiesWithoutNext(user.id),
    listCadenceEmailSteps({ userId: user.id, until: bounds.week }),
  ]);
  return (
    <>
      <h1 className="text-h2 leading-tight font-semibold">Oggi</h1>
      <p className="mt-2 text-body text-black-60">Le tue attività: scadute, di oggi e dei prossimi 7 giorni.</p>
      <div className="mt-6">
        <TodayView
          groups={groupToday(tasks, now)}
          withoutNext={withoutNext}
          now={now.getTime()}
          emailSteps={emailSteps.map((step) => ({
            taskId: step.taskId,
            href: prepareEmailHref(step),
            party: step.party,
            titolo: step.titolo,
            scadenza: step.scadenza,
            // Due by the end of today: in "Email della cadenza da inviare".
            due: step.scadenza !== null && Date.parse(step.scadenza) < bounds.tomorrow.getTime(),
          }))}
        />
      </div>
    </>
  );
}

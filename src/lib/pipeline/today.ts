// "Oggi" (CRM-19): the user's open reminders grouped as overdue (days
// before today), today (also when the time has passed: shown as late) and
// the next 7 days. Pure: unit tested.
import { dayBounds } from "./dates";

export type TodayGroups<T> = { scadute: T[]; oggi: T[]; settimana: T[] };

export function groupToday<T extends { scadenza: string | null }>(tasks: T[], now: Date): TodayGroups<T> {
  const { today, tomorrow, week } = dayBounds(now);
  const groups: TodayGroups<T> = { scadute: [], oggi: [], settimana: [] };
  const sorted = [...tasks].filter((task) => task.scadenza).sort((a, b) => Date.parse(a.scadenza!) - Date.parse(b.scadenza!));
  for (const task of sorted) {
    const due = Date.parse(task.scadenza!);
    if (due < today.getTime()) groups.scadute.push(task);
    else if (due < tomorrow.getTime()) groups.oggi.push(task);
    else if (due < week.getTime()) groups.settimana.push(task);
  }
  return groups;
}

// Count for the menu: reminders whose time has passed.
export function overdueCount(tasks: { scadenza: string | null }[], now: Date): number {
  return tasks.filter((task) => task.scadenza && Date.parse(task.scadenza) < now.getTime()).length;
}

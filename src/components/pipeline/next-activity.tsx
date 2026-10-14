import { Badge } from "@/components/ui/badge";
import { ACTIVITY_LABELS } from "@/lib/pipeline/labels";
import type { PipelineItem } from "@/lib/pipeline/queries";

const WHEN = new Intl.DateTimeFormat("it-IT", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Rome",
});

export function formatWhen(value: string): string {
  return WHEN.format(new Date(value)).replace(",", "");
}

// Next activity of an open opportunity: date (marked when overdue), or the
// "Senza prossima attività" warning (CRM-19).
export function NextActivity({ item, now }: { item: Pick<PipelineItem, "prossimaIl" | "next">; now: number }) {
  if (!item.prossimaIl) return <Badge tone="attention">Senza prossima attività</Badge>;
  const overdue = Date.parse(item.prossimaIl) < now;
  return (
    <p className="flex flex-wrap items-center gap-2 text-caption">
      <span className={overdue ? "font-semibold text-error-ink" : "text-black-80"}>
        {item.next ? ACTIVITY_LABELS[item.next.tipo] : "Prossima attività"}: {formatWhen(item.prossimaIl)}
      </span>
      {overdue && <Badge tone="critical">Scaduta</Badge>}
    </p>
  );
}

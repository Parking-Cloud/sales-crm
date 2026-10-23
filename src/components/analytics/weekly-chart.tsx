import type { Week } from "@/lib/analytics/aggregate";
import { formatNumber } from "@/lib/format";

// One small bar chart of a status change, week by week (block 1a-10). One
// hue (brand blue): each chart is one series, named by its title, so no
// legend. Every bar has its value as a tooltip and the same numbers are in
// the table under the charts. Empty weeks show a flat baseline (zero).

const W = 280;
const H = 128;
const PAD = { top: 12, right: 6, bottom: 22, left: 26 };

export function shortDay(day: string) {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

export function weekLabel(week: { da: string; a: string }) {
  return week.da === week.a ? shortDay(week.da) : `${shortDay(week.da)} – ${shortDay(week.a)}`;
}

export function WeeklyChart({ title, weeks, value }: { title: string; weeks: Week[]; value: (week: Week) => number }) {
  const values = weeks.map(value);
  const total = values.reduce((sum, n) => sum + n, 0);
  const max = Math.max(1, ...values);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / weeks.length;
  const barW = Math.max(3, Math.min(28, slot - 2));
  // Labels under at most about 6 bars, so they never overlap.
  const every = Math.ceil(weeks.length / 6);
  const y = (n: number) => PAD.top + plotH - (n / max) * plotH;

  return (
    <figure className="flex min-w-0 flex-col gap-2 rounded-md border border-grey-60 bg-white p-4">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-semibold text-brand-black">{title}</span>
        <span className="text-caption text-black-60 tabular-nums">Totale {formatNumber(total)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${title} per settimana: totale ${total}`}>
        {[0, max].map((tick) => (
          <g key={tick}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "stroke-black-40" : "stroke-grey-60"} strokeWidth={1} />
            <text x={PAD.left - 6} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-black-60 text-[11px] tabular-nums">
              {tick}
            </text>
          </g>
        ))}
        {weeks.map((week, i) => {
          const n = values[i];
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const top = y(n);
          const height = PAD.top + plotH - top;
          return (
            <g key={week.da}>
              <title>{`${weekLabel(week)}: ${n}`}</title>
              {/* Hit area taller than the bar, for the tooltip. */}
              <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} fill="transparent" />
              {n > 0 && (
                <path
                  d={`M${x},${PAD.top + plotH} V${top + Math.min(4, height)} q0,-${Math.min(4, height)} ${Math.min(4, barW / 2)},-${Math.min(4, height)} H${x + barW - Math.min(4, barW / 2)} q${Math.min(4, barW / 2)},0 ${Math.min(4, barW / 2)},${Math.min(4, height)} V${PAD.top + plotH} Z`}
                  className="fill-brand-blue"
                />
              )}
              {i % every === 0 && (
                <text x={PAD.left + i * slot + slot / 2} y={H - 6} textAnchor="middle" className="fill-black-60 text-[11px] tabular-nums">
                  {shortDay(week.da)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

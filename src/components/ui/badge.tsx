import { AlertTriangleIcon, ArchiveIcon, BanIcon } from "./icons";

// UI Kit badge (backoffice-app ui-kit/Badge): uppercase pill that always
// carries its meaning in the text; the tone only reinforces it.
// - info: in progress; attention: to check (with triangle icon);
// - success: positive; critical: error; neutral: concluded or inactive.
export type BadgeTone = "info" | "attention" | "success" | "critical" | "neutral";

const TONES: Record<BadgeTone, string> = {
  info: "bg-blue-20 text-blue-ink",
  attention: "bg-cyan-20 text-brand-black",
  success: "bg-success-surface text-success-ink",
  critical: "bg-error-surface text-error-ink",
  neutral: "bg-grey-40 text-black-80",
};

export function Badge({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: BadgeTone;
  icon?: "archive" | "ban";
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2 py-[3px] text-[11px] font-semibold leading-tight tracking-[0.06em] whitespace-nowrap uppercase ${TONES[tone]}`}
    >
      {tone === "attention" && <AlertTriangleIcon size={14} className="-ml-0.5 shrink-0" />}
      {icon === "archive" && <ArchiveIcon size={13} className="-ml-0.5 shrink-0" />}
      {icon === "ban" && <BanIcon size={13} className="-ml-0.5 shrink-0" />}
      {children}
    </span>
  );
}

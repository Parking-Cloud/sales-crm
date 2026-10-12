import { AlertCircleIcon, AlertTriangleIcon, CheckCircleIcon, InfoIcon } from "./icons";

// UI Kit alert (backoffice-app ui-kit/Alert): icon, optional title, text.
// Warnings and errors are announced (role="alert"), the rest is a status.
export type AlertTone = "info" | "success" | "warning" | "critical";

const TONES: Record<AlertTone, { box: string; icon: string }> = {
  info: { box: "border-blue-40 bg-info-surface text-info-ink", icon: "text-brand-blue" },
  success: { box: "border-success-line bg-success-surface text-success-ink", icon: "text-success" },
  warning: {
    box: "border-warn-line bg-warn-surface text-brand-black shadow-[inset_3px_0_0_var(--accent-cyan)]",
    icon: "text-brand-black",
  },
  critical: { box: "border-error-line bg-error-surface text-error-ink", icon: "text-error" },
};

const ICONS = {
  info: InfoIcon,
  success: CheckCircleIcon,
  warning: AlertTriangleIcon,
  critical: AlertCircleIcon,
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: AlertTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const Icon = ICONS[tone];
  const urgent = tone === "warning" || tone === "critical";
  return (
    <div
      role={urgent ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-md border px-4 py-3 text-[14px] leading-normal ${TONES[tone].box} ${className ?? ""}`}
    >
      <Icon size={20} className={`mt-px shrink-0 ${TONES[tone].icon}`} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

// Error message for a failed load or action.
export function ErrorMessage({ title = "Si è verificato un errore", children }: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <Alert tone="critical" title={title}>
      {children}
    </Alert>
  );
}

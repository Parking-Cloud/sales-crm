import type { ComponentProps } from "react";
import { AlertCircleIcon } from "./icons";

// UI Kit form field (backoffice-app ui-kit/Field): uppercase label always
// visible, the control, then the hint or the error. The error replaces the
// hint and comes with an icon, so it never relies on colour alone.
export function describedBy(id: string) {
  return `${id}-descrizione`;
}

export function Field({
  id,
  label,
  hint,
  error,
  required = false,
  children,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label
        htmlFor={id}
        className="text-label leading-tight font-semibold tracking-[0.08em] text-black-80 uppercase"
      >
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="ml-0.5 text-error">
              *
            </span>
            <span className="sr-only"> (obbligatorio)</span>
          </>
        )}
      </label>
      {children}
      {error ? (
        <p id={describedBy(id)} className="flex items-start gap-2 text-caption leading-snug text-error-ink">
          <AlertCircleIcon className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={describedBy(id)} className="text-caption leading-snug text-black-60">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

// Shared control frame: 44px, radius 8, grey border; blue on focus, red when
// invalid. The global focus outline stays on top for keyboard users.
const CONTROL =
  "w-full min-w-0 rounded-sm border bg-white text-[16px] text-brand-black shadow-sm transition-colors placeholder:text-black-40 hover:border-black-40 focus:border-brand-blue disabled:cursor-not-allowed disabled:bg-grey-20 disabled:text-black-40 md:text-[15px]";

function controlClasses(invalid: boolean | undefined, extra: string) {
  return [
    CONTROL,
    invalid ? "border-error hover:border-error focus:border-error" : "border-brand-grey",
    extra,
  ].join(" ");
}

type ControlExtras = { invalid?: boolean; hasDescription?: boolean };

function a11yProps(id: string | undefined, { invalid, hasDescription }: ControlExtras) {
  return {
    "aria-invalid": invalid || undefined,
    "aria-describedby": id && hasDescription ? describedBy(id) : undefined,
  };
}

export function Input({
  invalid,
  hasDescription,
  className,
  ...props
}: ComponentProps<"input"> & ControlExtras) {
  return (
    <input
      className={controlClasses(invalid, `min-h-(--control-h) px-3 ${className ?? ""}`)}
      {...a11yProps(props.id, { invalid, hasDescription })}
      {...props}
    />
  );
}

export function Textarea({
  invalid,
  hasDescription,
  className,
  ...props
}: ComponentProps<"textarea"> & ControlExtras) {
  return (
    <textarea
      className={controlClasses(invalid, `min-h-24 resize-y p-3 leading-normal ${className ?? ""}`)}
      {...a11yProps(props.id, { invalid, hasDescription })}
      {...props}
    />
  );
}

export function Select({
  invalid,
  hasDescription,
  className,
  children,
  ...props
}: ComponentProps<"select"> & ControlExtras) {
  return (
    <div className="relative">
      <select
        className={controlClasses(
          invalid,
          `min-h-(--control-h) cursor-pointer appearance-none pr-10 pl-3 ${className ?? ""}`,
        )}
        {...a11yProps(props.id, { invalid, hasDescription })}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-black-60"
      >
        <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// Checkbox with its label on the right (20x20, brand blue).
export function Checkbox({
  label,
  hint,
  className,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label className="inline-flex min-h-6 cursor-pointer items-start gap-2 text-[15px] leading-snug text-brand-black">
        <input type="checkbox" className="mt-px size-5 shrink-0 cursor-pointer accent-brand-blue" {...props} />
        <span>{label}</span>
      </label>
      {hint && <p className="ml-7 text-caption text-black-60">{hint}</p>}
    </div>
  );
}

import Link from "next/link";
import type { ComponentProps } from "react";

// UI Kit button (backoffice-app ui-kit/Button): primary, secondary, ghost and
// destructive; sm 36px and md 44px (44px on phones for touch targets).
// The focus ring is the global :focus-visible outline (globals.css).
export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-sm border font-semibold leading-tight whitespace-nowrap no-underline transition-colors disabled:cursor-not-allowed";

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-(--control-h) px-3 text-[14px] md:min-h-(--control-h-sm)",
  md: "min-h-(--control-h) px-5 text-[15px]",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border-brand-blue bg-brand-blue text-white hover:border-blue-hover hover:bg-blue-hover active:bg-blue-pressed disabled:border-brand-grey disabled:bg-grey-40 disabled:text-black-40",
  secondary:
    "border-brand-blue bg-white text-brand-blue hover:border-blue-hover hover:bg-blue-20 hover:text-blue-hover active:bg-blue-40 disabled:border-brand-grey disabled:bg-grey-40 disabled:text-black-40",
  ghost:
    "border-transparent bg-transparent text-brand-blue hover:bg-grey-40 hover:text-blue-hover disabled:text-black-40",
  destructive:
    "border-error bg-error text-white hover:border-error-hover hover:bg-error-hover disabled:border-brand-grey disabled:bg-grey-40 disabled:text-black-40",
};

export function buttonClasses(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "sm",
  extra?: string,
) {
  return [BASE, SIZES[size], VARIANTS[variant], extra].filter(Boolean).join(" ");
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "secondary",
  size = "sm",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

// A link that looks like a button (navigation, not an action).
export function ButtonLink({ variant = "secondary", size = "sm", className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}

// Small inline icons used by UI Kit components. Decorative: always paired
// with visible text, so they are hidden from assistive technology.
type IconProps = { className?: string; size?: number };

export function AlertCircleIcon({ className, size = 16 }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" className={className}>
      <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10 5.75v5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="10" cy="13.75" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function AlertTriangleIcon({ className, size = 16 }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" className={className}>
      <path
        d="M10 2.75 18 16.5H2L10 2.75Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M10 8v4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="10" cy="14.25" r="1.05" fill="currentColor" />
    </svg>
  );
}

export function CheckCircleIcon({ className, size = 16 }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" className={className}>
      <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="m6.5 10.25 2.4 2.4 4.6-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function InfoIcon({ className, size = 16 }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" className={className}>
      <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M10 9v5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <circle cx="10" cy="6.25" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function ArchiveIcon({ className, size = 14 }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" className={className}>
      <rect x="2.5" y="3.5" width="15" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M4 7.5v8.25c0 .4.35.75.75.75h10.5c.4 0 .75-.35.75-.75V7.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 11h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function BanIcon({ className, size = 14 }: IconProps) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 20 20" className={className}>
      <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="m4.5 15.5 11-11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

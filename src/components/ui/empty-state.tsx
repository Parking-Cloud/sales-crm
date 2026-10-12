// Empty state: what is missing and, when the user can act, what to do next.
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-brand-grey bg-white px-6 py-10 sm:items-center sm:text-center">
      <p className="text-h4 font-semibold">{title}</p>
      {children && <div className="max-w-[56ch] text-body text-black-60">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

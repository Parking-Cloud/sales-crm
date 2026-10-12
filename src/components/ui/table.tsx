// UI Kit table (backoffice-app ui-kit/Table): uppercase 11px headings on
// grey-20, row separators, no zebra striping. Scrolls sideways on phones,
// with the first column kept visible.
export function Table({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="relative max-w-full overflow-x-auto rounded-md border border-grey-60 bg-white">
      <table className="w-full border-separate border-spacing-0 text-[14px] leading-snug text-brand-black">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

const STICKY_FIRST =
  "max-md:first:sticky max-md:first:left-0 max-md:first:z-[1] max-md:first:shadow-[1px_0_0_var(--grey-60)]";

export function Th({
  children,
  align = "start",
}: {
  children?: React.ReactNode;
  align?: "start" | "end";
}) {
  return (
    <th
      scope="col"
      className={`border-b border-brand-grey bg-grey-20 px-3 py-2 align-bottom text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap text-black-80 uppercase ${align === "end" ? "text-right" : "text-left"} ${STICKY_FIRST}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "start",
  wrap = false,
}: {
  children?: React.ReactNode;
  align?: "start" | "end";
  wrap?: boolean;
}) {
  return (
    <td
      className={`border-b border-grey-60 bg-white px-3 py-2.5 align-middle group-last/row:border-b-0 ${wrap ? "min-w-40" : "whitespace-nowrap"} ${align === "end" ? "text-right tabular-nums" : "text-left"} ${STICKY_FIRST}`}
    >
      {children}
    </td>
  );
}

export function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="group/row">{children}</tr>;
}

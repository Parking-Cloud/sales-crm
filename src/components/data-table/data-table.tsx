"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { SelectAllCheckbox, SelectPartyCheckbox } from "@/components/pipeline/add-to-parking";
import { pageCount, pageRange } from "@/lib/tables/paging";
import { hasFilters, nextSort, tableSearch, withFilter, type TableQuery } from "@/lib/tables/query";

// Table shared by Prospect, Pipeline and Promemoria (block 1a-9):
// - pages of at most 50 rows, with arrows and the page number;
// - sideways scrolling with the company name column kept in view;
// - filters in a row under the headings and sorting from the headings, both
//   in the URL;
// - cells edited in place (see editable.tsx);
// - optional selection: "select all" ticks the rows of the current page.

export type FilterOption = { value: string; label: string };

// Selection: form checkboxes read by a form (Prospect), or a set held by the
// page and kept across pages (map search), with "full" when no more rows can
// be added.
export type TableSelection<Row> =
  | { formId: string; label: (row: Row) => string }
  | { selected: ReadonlySet<string>; onChange: (ids: string[], on: boolean) => void; label: (row: Row) => string; full?: boolean };

function ControlledCheckbox({ checked, indeterminate, disabled, label, onChange }: { checked: boolean; indeterminate?: boolean; disabled?: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      ref={(node) => {
        if (node) node.indeterminate = Boolean(indeterminate);
      }}
      onChange={(event) => onChange(event.target.checked)}
      className="size-5 cursor-pointer accent-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

export type ColumnFilter =
  | { param: string; type: "text"; placeholder?: string }
  | { param: string; type: "select"; options: FilterOption[]; allLabel?: string };

export type Column<Row> = {
  key: string;
  label: string;
  // Sort key sent to the database; none = not sortable.
  sort?: string;
  filter?: ColumnFilter;
  // The company name column: stays in view when the table scrolls sideways.
  sticky?: boolean;
  // Minimum width of the column (Tailwind class), for editable cells.
  width?: string;
  cell: (row: Row) => React.ReactNode;
};

const STICKY = "sticky left-0 z-[2] shadow-[1px_0_0_var(--grey-60)]";

function SortButton({ label, active, desc, onClick }: { label: string; active: boolean; desc: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-xs text-[11px] font-semibold tracking-[0.04em] uppercase hover:text-brand-blue"
    >
      {label}
      <span aria-hidden="true" className={active ? "text-brand-blue" : "text-black-40"}>
        {active ? (desc ? "↓" : "↑") : "↕"}
      </span>
      <span className="sr-only">
        {active ? (desc ? ", ordinata dalla Z alla A: clic per togliere l'ordinamento" : ", ordinata dalla A alla Z: clic per invertire") : ": clic per ordinare"}
      </span>
    </button>
  );
}

function FilterControl({
  filter,
  label,
  value,
  onApply,
}: {
  filter: ColumnFilter;
  label: string;
  value: string;
  onApply: (value: string) => void;
}) {
  const base =
    "h-(--control-h-sm) w-full min-w-28 rounded-xs border border-grey-80 bg-white px-2 text-[13px] font-normal normal-case tracking-normal text-brand-black placeholder:text-black-40";
  if (filter.type === "select") {
    return (
      <select aria-label={`Filtra per ${label}`} value={value} onChange={(event) => onApply(event.target.value)} className={base}>
        <option value="">{filter.allLabel ?? "Tutti"}</option>
        {filter.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      // A new key when the URL value changes resets the typed text.
      key={value}
      type="search"
      aria-label={`Filtra per ${label}`}
      defaultValue={value}
      placeholder={filter.placeholder ?? "Filtra"}
      autoComplete="off"
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onApply(event.currentTarget.value);
        }
      }}
      onBlur={(event) => {
        if (event.currentTarget.value.trim() !== value) onApply(event.currentTarget.value);
      }}
      className={base}
    />
  );
}

export function DataTable<Row extends { id: string }>({
  caption,
  columns,
  rows,
  total,
  query,
  empty,
  selection,
  onQueryChange,
  rowId,
  rowClassName,
}: {
  caption: string;
  columns: Column<Row>[];
  rows: Row[];
  total: number;
  query: TableQuery;
  // Message when no row matches.
  empty: string;
  selection?: TableSelection<Row>;
  // Rows held by the page (map search): filters, sorting and pages change
  // through this instead of the URL.
  onQueryChange?: (next: TableQuery) => void;
  // Id of the row element (to scroll to it) and extra classes of its cells.
  rowId?: (row: Row) => string;
  rowClassName?: (row: Row) => string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const pages = pageCount(total);
  const filtered = hasFilters(query);
  const controlled = selection && "selected" in selection ? selection : null;
  const pageIds = rows.map((row) => row.id);
  const pageChecked = controlled ? pageIds.filter((id) => controlled.selected.has(id)).length : 0;

  function go(next: TableQuery) {
    if (onQueryChange) return onQueryChange(next);
    startTransition(() => router.push(`${pathname}${tableSearch(next)}`, { scroll: false }));
  }

  const pageHref = (page: number) => `${pathname}${tableSearch({ ...query, page })}`;
  const arrow = "inline-flex size-(--control-h) items-center justify-center rounded-sm border text-[18px] leading-none md:size-(--control-h-sm)";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-black-60" aria-live="polite">
          {total === 0 ? "Nessuna riga" : `Righe ${pageRange(query.page, total)}`}
          {pending && " · aggiornamento..."}
        </p>
        {filtered &&
          (onQueryChange ? (
            <button
              type="button"
              onClick={() => go({ ...query, filters: {}, page: 1 })}
              className="rounded-xs text-caption font-semibold text-blue-ink underline underline-offset-2"
            >
              Togli i filtri
            </button>
          ) : (
            <Link href={pathname} scroll={false} className="rounded-xs text-caption font-semibold text-blue-ink underline underline-offset-2">
              Togli i filtri
            </Link>
          ))}
      </div>

      <div className={`relative max-w-full overflow-x-auto rounded-md border border-grey-60 bg-white ${pending ? "opacity-70" : ""}`} aria-busy={pending || undefined}>
        <table className="w-full border-separate border-spacing-0 text-[14px] leading-snug text-brand-black">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {selection && (
                <th scope="col" className="w-10 border-b border-grey-60 bg-grey-20 px-3 py-2 text-left">
                  {controlled ? (
                    <ControlledCheckbox
                      label="Seleziona tutte le righe di questa pagina"
                      checked={rows.length > 0 && pageChecked === rows.length}
                      indeterminate={pageChecked > 0 && pageChecked < rows.length}
                      disabled={rows.length === 0 || (Boolean(controlled.full) && pageChecked === 0)}
                      onChange={(on) => controlled.onChange(pageIds, on)}
                    />
                  ) : (
                    "formId" in selection && <SelectAllCheckbox key={tableSearch(query)} formId={selection.formId} label="Seleziona tutte le righe di questa pagina" />
                  )}
                </th>
              )}
              {columns.map((column) => {
                const active = query.sort === column.sort && Boolean(column.sort);
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={active ? (query.desc ? "descending" : "ascending") : undefined}
                    className={`border-b border-grey-60 bg-grey-20 px-3 pt-2 pb-1 text-left align-bottom text-[11px] font-semibold tracking-[0.04em] whitespace-nowrap text-black-80 uppercase ${column.width ?? ""} ${column.sticky ? STICKY : ""}`}
                  >
                    {column.sort ? (
                      <SortButton label={column.label} active={active} desc={query.desc} onClick={() => go(nextSort(query, column.sort!))} />
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
            </tr>
            <tr>
              {selection && <td className="border-b border-brand-grey bg-grey-20" />}
              {columns.map((column) => (
                <td key={column.key} className={`border-b border-brand-grey bg-grey-20 px-3 pb-2 align-top ${column.sticky ? STICKY : ""}`}>
                  {column.filter && (
                    <FilterControl
                      filter={column.filter}
                      label={column.label}
                      value={query.filters[column.filter.param] ?? ""}
                      onApply={(value) => go(withFilter(query, column.filter!.param, value))}
                    />
                  )}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selection ? 1 : 0)} className="px-3 py-8 text-center text-body text-black-60">
                  {filtered ? "Nessuna riga con questi filtri." : empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} id={rowId?.(row)} className="group/row scroll-mt-24">
                  {selection && (
                    <td className={`border-b border-grey-60 bg-white px-3 py-2 align-top group-last/row:border-b-0 ${rowClassName?.(row) ?? ""}`}>
                      {controlled ? (
                        <ControlledCheckbox
                          label={`Seleziona ${selection.label(row)}`}
                          checked={controlled.selected.has(row.id)}
                          disabled={Boolean(controlled.full) && !controlled.selected.has(row.id)}
                          onChange={(on) => controlled.onChange([row.id], on)}
                        />
                      ) : (
                        "formId" in selection && <SelectPartyCheckbox formId={selection.formId} partyId={row.id} label={selection.label(row)} />
                      )}
                    </td>
                  )}
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`border-b border-grey-60 bg-white px-3 py-2 align-top group-last/row:border-b-0 ${column.width ?? ""} ${column.sticky ? STICKY : ""} ${rowClassName?.(row) ?? ""}`}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav aria-label="Pagine della tabella" className="flex items-center justify-end gap-2">
          {query.page > 1 ? (
            onQueryChange ? (
              <button type="button" onClick={() => go({ ...query, page: query.page - 1 })} aria-label="Pagina precedente" className={`${arrow} border-brand-blue bg-white text-brand-blue hover:bg-blue-20`}>
                <span aria-hidden="true">‹</span>
              </button>
            ) : (
              <Link href={pageHref(query.page - 1)} scroll={false} rel="prev" aria-label="Pagina precedente" className={`${arrow} border-brand-blue bg-white text-brand-blue hover:bg-blue-20`}>
                <span aria-hidden="true">‹</span>
              </Link>
            )
          ) : (
            <span aria-hidden="true" className={`${arrow} border-brand-grey bg-grey-40 text-black-40`}>
              ‹
            </span>
          )}
          <span className="min-w-28 text-center text-caption text-black-80" aria-current="page">
            Pagina {query.page} di {pages}
          </span>
          {query.page < pages ? (
            onQueryChange ? (
              <button type="button" onClick={() => go({ ...query, page: query.page + 1 })} aria-label="Pagina successiva" className={`${arrow} border-brand-blue bg-white text-brand-blue hover:bg-blue-20`}>
                <span aria-hidden="true">›</span>
              </button>
            ) : (
              <Link href={pageHref(query.page + 1)} scroll={false} rel="next" aria-label="Pagina successiva" className={`${arrow} border-brand-blue bg-white text-brand-blue hover:bg-blue-20`}>
                <span aria-hidden="true">›</span>
              </Link>
            )
          ) : (
            <span aria-hidden="true" className={`${arrow} border-brand-grey bg-grey-40 text-black-40`}>
              ›
            </span>
          )}
        </nav>
      )}
    </div>
  );
}

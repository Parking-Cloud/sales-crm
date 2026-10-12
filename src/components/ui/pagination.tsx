import Link from "next/link";
import { buttonClasses } from "./button";

// Previous / next paging with the current position (UI Kit Pagination).
// hrefFor builds the link of a page, keeping the current filters.
export function Pagination({
  page,
  pageCount,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
}) {
  if (pageCount <= 1) return null;
  const disabled = "pointer-events-none border-brand-grey bg-grey-40 text-black-40";
  return (
    <nav aria-label="Pagine" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-caption text-black-60">
        Pagina {page} di {pageCount}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={buttonClasses("secondary", "sm")} rel="prev">
            Precedente
          </Link>
        ) : (
          <span aria-disabled="true" className={buttonClasses("secondary", "sm", disabled)}>
            Precedente
          </span>
        )}
        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} className={buttonClasses("secondary", "sm")} rel="next">
            Successiva
          </Link>
        ) : (
          <span aria-disabled="true" className={buttonClasses("secondary", "sm", disabled)}>
            Successiva
          </span>
        )}
      </div>
    </nav>
  );
}

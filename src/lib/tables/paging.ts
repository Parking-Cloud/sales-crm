import { NUMBER_FORMAT_IT } from "../format";

// Pages of the tables (Prospect, Pipeline, Promemoria): at most 50 rows.
// Pure: unit tested.

export const TABLE_PAGE_SIZE = 50;

export function pageCount(total: number, size = TABLE_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / size));
}

// Page from the URL: a whole number from 1; past the end, the last page.
export function readPage(value: unknown, total?: number): number {
  const page = typeof value === "string" && /^\d{1,6}$/.test(value) ? Number(value) : 1;
  const clamped = Math.max(1, page);
  return total === undefined ? clamped : Math.min(clamped, pageCount(total));
}

export function pageOffset(page: number, size = TABLE_PAGE_SIZE): number {
  return (Math.max(1, page) - 1) * size;
}

// "1–50 di 382": the rows shown on a page.
export function pageRange(page: number, total: number, size = TABLE_PAGE_SIZE): string {
  if (total <= 0) return "0 di 0";
  const first = pageOffset(page, size) + 1;
  const last = Math.min(total, first + size - 1);
  return `${NUMBER_FORMAT_IT.format(first)}–${NUMBER_FORMAT_IT.format(last)} di ${NUMBER_FORMAT_IT.format(total)}`;
}

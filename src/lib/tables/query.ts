import { readPage } from "./paging";

// Filters, sorting and page of a table, kept in the URL so a view can be
// shared and survives a refresh: one parameter per filter, "ordina" (column),
// "verso=desc", "pagina". Pure: unit tested.

export type TableQuery = {
  filters: Record<string, string>;
  sort: string | null;
  desc: boolean;
  page: number;
};

type Params = Record<string, string | string[] | undefined>;

export function readTableQuery(params: Params, filterKeys: readonly string[], sortKeys: readonly string[]): TableQuery {
  const one = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value.trim().slice(0, 120) : "";
  };
  const filters: Record<string, string> = {};
  for (const key of filterKeys) {
    const value = one(key);
    if (value) filters[key] = value;
  }
  const sort = one("ordina");
  return {
    filters,
    sort: sortKeys.includes(sort) ? sort : null,
    desc: one("verso") === "desc",
    page: readPage(one("pagina")),
  };
}

export function tableSearch(query: TableQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query.filters)) if (value) params.set(key, value);
  if (query.sort) params.set("ordina", query.sort);
  if (query.sort && query.desc) params.set("verso", "desc");
  if (query.page > 1) params.set("pagina", String(query.page));
  const search = params.toString();
  return search ? `?${search}` : "";
}

// A filter changed: back to the first page.
export function withFilter(query: TableQuery, key: string, value: string): TableQuery {
  const filters = { ...query.filters };
  if (value.trim()) filters[key] = value.trim();
  else delete filters[key];
  return { ...query, filters, page: 1 };
}

// Header click: ascending, descending, then back to the default order.
export function nextSort(query: TableQuery, key: string): TableQuery {
  if (query.sort !== key) return { ...query, sort: key, desc: false, page: 1 };
  if (!query.desc) return { ...query, desc: true, page: 1 };
  return { ...query, sort: null, desc: false, page: 1 };
}

export function hasFilters(query: TableQuery): boolean {
  return Object.keys(query.filters).length > 0;
}

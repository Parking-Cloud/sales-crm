// Selection kept across the pages of a table, with an upper limit (the map
// search imports at most 50 results at a time). Pure: unit tested.

// Adds or removes ids; when adding, only up to `max` selected in total (the
// first ones in order).
export function toggleSelection(selected: ReadonlySet<string>, ids: readonly string[], on: boolean, max = Infinity): Set<string> {
  const next = new Set(selected);
  if (!on) {
    ids.forEach((id) => next.delete(id));
    return next;
  }
  for (const id of ids) {
    if (next.size >= max) break;
    next.add(id);
  }
  return next;
}

// The rows of one page.
export function pageRows<T>(rows: readonly T[], page: number, size: number): T[] {
  const start = (Math.max(1, page) - 1) * size;
  return rows.slice(start, start + size);
}

// State of the "select all" box of a page.
export function pageSelection(selected: ReadonlySet<string>, ids: readonly string[]): "all" | "some" | "none" {
  const count = ids.filter((id) => selected.has(id)).length;
  return count === 0 ? "none" : count === ids.length ? "all" : "some";
}

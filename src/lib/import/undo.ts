// Result of public.undo_import_batch made safe to show: strings and
// numbers only, whatever the database returns. Pure: unit tested.

export type UndoBlocker = {
  tabella: string;
  id: string;
  descrizione: string;
  partyId: string | null;
  soggetto: string;
  // The import that added the blocking row; null when changed by hand.
  batchId: string | null;
};
export type UndoCause = { batchId: string | null; file: string | null; createdAt: string | null; n: number };
export type UndoBlocked = { totale: number; cause: UndoCause[]; blockers: UndoBlocker[] };
export type UndoResult = { blocked: UndoBlocked | null; eliminati: Record<string, number> };

const text = (value: unknown, fallback = ""): string => (typeof value === "string" && value.trim() ? value : fallback);
export const uuidOrNull = (value: unknown): string | null => (typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null);
const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];

// The SQL result made safe to show: strings and numbers only. Null when it
// is not a result of the function (neither done nor blocked).
export function readUndo(data: unknown): UndoResult | null {
  const raw = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (raw.ok !== true && raw.ok !== false) return null;
  const eliminati = Object.fromEntries(
    Object.entries((raw.eliminati && typeof raw.eliminati === "object" ? raw.eliminati : {}) as Record<string, unknown>).map(([key, value]) => [key, count(value)]),
  );
  if (raw.ok === true) return { blocked: null, eliminati };
  const blockers = list(raw.blockers).map((item) => ({
    tabella: text(item.tabella),
    id: text(item.id),
    descrizione: text(item.descrizione, "Modifica dopo l'import"),
    partyId: uuidOrNull(item.party_id),
    soggetto: text(item.soggetto, "Soggetto senza nome"),
    batchId: uuidOrNull(item.batch_id),
  }));
  const cause = list(raw.cause).map((item) => ({
    batchId: uuidOrNull(item.batch_id),
    file: typeof item.file === "string" ? item.file : null,
    createdAt: typeof item.created_at === "string" ? item.created_at : null,
    n: count(item.n),
  }));
  return { blocked: { totale: Math.max(count(raw.totale), blockers.length), cause, blockers }, eliminati };
}

export function isUuid(value: unknown): value is string {
  return uuidOrNull(value) !== null;
}

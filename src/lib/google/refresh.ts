// refreshGoogleData: Google coordinates are kept at most 30 days. Locations
// with Google coordinates older than 25 days are re-read with Place Details
// (location only, Essentials SKU), at most 200 per run; a place that no
// longer exists loses its coordinates. Each request is counted in api_usage.
// Used by the nightly Netlify scheduled function (service role) and by the
// "Aggiorna" button. Relative imports only; the database and Google calls
// are passed in, so it is unit tested with fake answers.

import type { LatLng } from "../places/geo";

export const REFRESH_AFTER_DAYS = 25;
export const MAX_PER_RUN = 200;
const PARALLEL = 8;

type RpcResult = { data: unknown; error: { code?: string; message: string } | null };
export type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult> };
export type LocateFn = (placeId: string) => Promise<LatLng | null>;

export type RefreshResult = { lette: number; aggiornate: number; cancellate: number; errori: number; limite: boolean };

async function call(client: RpcClient, name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.code ?? error.message}`);
  return data;
}

export async function refreshGoogleData(
  client: RpcClient,
  locate: LocateFn,
  options: { limit?: number; days?: number; locationIds?: string[] } = {},
): Promise<RefreshResult> {
  const due = ((await call(client, "google_locations_due", {
    p_limit: Math.min(options.limit ?? MAX_PER_RUN, MAX_PER_RUN),
    p_days: options.days ?? REFRESH_AFTER_DAYS,
  })) ?? []) as { location_id: string; place_id: string }[];
  const wanted = options.locationIds ? due.filter((row) => options.locationIds!.includes(row.location_id)) : due;

  const result: RefreshResult = { lette: 0, aggiornate: 0, cancellate: 0, errori: 0, limite: false };
  const rows: { location_id: string; lat: number | null; lng: number | null }[] = [];
  for (let i = 0; i < wanted.length; i += PARALLEL) {
    const batch = wanted.slice(i, i + PARALLEL);
    const quota = (await call(client, "use_api_quota", { p_sku: "place_details_essentials", p_n: batch.length })) as { ok?: boolean } | null;
    if (!quota?.ok) {
      result.limite = true;
      break;
    }
    const answers = await Promise.allSettled(batch.map((row) => locate(row.place_id)));
    answers.forEach((answer, index) => {
      result.lette += 1;
      if (answer.status === "rejected") {
        // Google error: left as it is, retried next night (still unused after 30 days).
        result.errori += 1;
        return;
      }
      rows.push({ location_id: batch[index].location_id, lat: answer.value?.lat ?? null, lng: answer.value?.lng ?? null });
    });
  }

  if (rows.length > 0) {
    const applied = (await call(client, "apply_google_coordinates", { p_rows: rows })) as { aggiornate?: number; cancellate?: number } | null;
    result.aggiornate = applied?.aggiornate ?? 0;
    result.cancellate = applied?.cancellate ?? 0;
  }
  return result;
}

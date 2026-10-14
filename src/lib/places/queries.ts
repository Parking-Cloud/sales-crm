import { createClient } from "@/lib/supabase/server";

// Reads for the map search (RLS applies).

export type SearchParking = { id: string; nome: string; lat: number; lng: number; raggio_m: number | null };

// Active car parks with coordinates: the only possible search centres.
export async function listSearchParkings(): Promise<SearchParking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parking_facilities")
    .select("id, nome, lat, lng, raggio_m")
    .is("archived_at", null)
    .not("lat", "is", null)
    .not("lng", "is", null)
    .order("nome");
  if (error) throw new Error(`parking_facilities: ${error.code ?? error.message}`);
  return data.flatMap((row) => (row.lat !== null && row.lng !== null ? [{ ...row, lat: row.lat, lng: row.lng }] : []));
}

export type MonthUsage = { sku: string; chiamate: number };

// Calls of the current month (Europe/Rome) by SKU.
export async function monthUsage(): Promise<MonthUsage[]> {
  const supabase = await createClient();
  const now = new Date();
  const month = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).format(now);
  const { data, error } = await supabase.from("api_usage").select("sku, chiamate").gte("giorno", `${month}-01`);
  if (error) throw new Error(`api_usage: ${error.code ?? error.message}`);
  const totals = new Map<string, number>();
  data.forEach((row) => totals.set(row.sku, (totals.get(row.sku) ?? 0) + row.chiamate));
  return [...totals].map(([sku, chiamate]) => ({ sku, chiamate }));
}

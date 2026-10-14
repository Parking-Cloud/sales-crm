import { createClient } from "@/lib/supabase/server";
import {
  MAX_PARKING_DISTANCE_DEFAULT_M,
  MAX_PARKING_DISTANCE_KEY,
  MAX_PARKING_DISTANCE_MAX_M,
  MAX_PARKING_DISTANCE_MIN_M,
} from "./distance";

// Reads of app_settings with the signed-in user's session (RLS).

export type MaxParkingDistance = { meters: number; updatedAt: string | null };

export async function getMaxParkingDistance(): Promise<MaxParkingDistance> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("valore, updated_at")
    .eq("chiave", MAX_PARKING_DISTANCE_KEY)
    .maybeSingle();
  if (error) throw new Error(`app_settings: ${error.code ?? error.message}`);
  const value = data?.valore;
  const valid =
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MAX_PARKING_DISTANCE_MIN_M &&
    value <= MAX_PARKING_DISTANCE_MAX_M;
  return { meters: valid ? value : MAX_PARKING_DISTANCE_DEFAULT_M, updatedAt: data?.updated_at ?? null };
}

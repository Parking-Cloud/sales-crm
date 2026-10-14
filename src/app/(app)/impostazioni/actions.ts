"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { parseDecimal } from "@/lib/format";
import {
  MAX_PARKING_DISTANCE_KEY,
  MAX_PARKING_DISTANCE_MAX_M,
  MAX_PARKING_DISTANCE_MIN_M,
} from "@/lib/settings/distance";
import { API_LIMIT_KEYS, API_LIMIT_MAX } from "@/lib/settings/api-limits";
import { createClient } from "@/lib/supabase/server";

// Writes to app_settings. The admin check gives a clear message; row level
// security and the table check constraint are what actually enforce it.

export type SettingFormState = {
  // Increments on every response, so the form remounts with the new values.
  version: number;
  status: "idle" | "saved" | "error";
  message?: string;
  fieldError?: string;
  value?: string;
};

const NOT_ADMIN = "Solo l'amministratore può modificare le impostazioni.";
const OUT_OF_RANGE = "Inserisci una distanza da 0,5 a 20 km.";

export async function saveMaxParkingDistance(previous: SettingFormState, form: FormData): Promise<SettingFormState> {
  const version = previous.version + 1;
  const raw = typeof form.get("distanza_km") === "string" ? (form.get("distanza_km") as string).trim() : "";

  const user = await getCurrentUser();
  if (!user?.isAdmin) return { version, status: "error", message: NOT_ADMIN, value: raw };

  const km = parseDecimal(raw);
  const meters = km === null || Number.isNaN(km) ? Number.NaN : Math.round(km * 1000);
  if (!(meters >= MAX_PARKING_DISTANCE_MIN_M && meters <= MAX_PARKING_DISTANCE_MAX_M)) {
    return { version, status: "error", message: "Controlla il campo evidenziato.", fieldError: OUT_OF_RANGE, value: raw };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_settings")
    .update({ valore: meters })
    .eq("chiave", MAX_PARKING_DISTANCE_KEY)
    .select("id");
  if (error || !data || data.length === 0) {
    const message =
      error?.code === "42501" || (!error && data?.length === 0)
        ? NOT_ADMIN
        : "Salvataggio non riuscito. Riprova; se il problema continua, avvisa l'amministratore.";
    return { version, status: "error", message, value: raw };
  }

  revalidatePath("/impostazioni");
  revalidatePath("/soggetti", "layout");
  return { version, status: "saved" };
}

export type LimitsFormState = {
  version: number;
  status: "idle" | "saved" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"nearby" | "details", string>>;
  values?: { nearby: string; details: string };
};

// Daily limits of Google calls. 0 blocks the calls of that kind.
export async function saveApiLimits(previous: LimitsFormState, form: FormData): Promise<LimitsFormState> {
  const version = previous.version + 1;
  const raw = {
    nearby: typeof form.get("nearby") === "string" ? (form.get("nearby") as string).trim() : "",
    details: typeof form.get("details") === "string" ? (form.get("details") as string).trim() : "",
  };
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { version, status: "error", message: NOT_ADMIN, values: raw };

  const fieldErrors: LimitsFormState["fieldErrors"] = {};
  const parsed = { nearby: Number(raw.nearby), details: Number(raw.details) };
  for (const key of ["nearby", "details"] as const) {
    if (!/^\d+$/.test(raw[key]) || parsed[key] > API_LIMIT_MAX) fieldErrors[key] = `Inserisci un numero intero da 0 a ${API_LIMIT_MAX.toLocaleString("it-IT")}.`;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { version, status: "error", message: "Controlla i campi evidenziati.", fieldErrors, values: raw };
  }

  const supabase = await createClient();
  for (const key of ["nearby", "details"] as const) {
    const { data, error } = await supabase
      .from("app_settings")
      .update({ valore: parsed[key] })
      .eq("chiave", API_LIMIT_KEYS[key])
      .select("id");
    if (error || !data || data.length === 0) {
      return {
        version,
        status: "error",
        message: error?.code === "42501" || (!error && data?.length === 0) ? NOT_ADMIN : "Salvataggio non riuscito. Riprova.",
        values: raw,
      };
    }
  }
  revalidatePath("/impostazioni");
  return { version, status: "saved" };
}

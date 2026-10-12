"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { geocodeAddress } from "@/lib/geo/nominatim";
import { parseDecimal } from "@/lib/format";
import type { FormState } from "@/lib/parking/form-state";
import { getFacility, listUserOptions } from "@/lib/parking/queries";
import {
  FACILITY_FIELDS,
  PRODUCT_FIELDS,
  facilityAddress,
  readRawValues,
  validateFacility,
  validateProduct,
} from "@/lib/parking/validation";
import { createClient } from "@/lib/supabase/server";

// Writes for car parks and products. The admin check gives a clear message;
// row level security is what actually enforces it.

const NOT_ADMIN = "Solo l'amministratore può modificare parcheggi e listini.";
const SAVE_FAILED = "Salvataggio non riuscito. Riprova; se il problema continua, avvisa l'amministratore.";

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function writeError(code: string | undefined): string {
  return code === "42501" ? NOT_ADMIN : SAVE_FAILED;
}

async function requireAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return Boolean(user?.isAdmin);
}

// ---------------------------------------------------------------------------
// Car park
// ---------------------------------------------------------------------------

export async function saveFacility(previous: FormState, form: FormData): Promise<FormState> {
  const version = previous.version + 1;
  const raw = readRawValues(form, FACILITY_FIELDS);
  if (!(await requireAdmin())) return { version, status: "error", message: NOT_ADMIN, values: raw };

  const id = field(form, "id");
  const existing = id ? await getFacility(id) : null;
  if (id && !existing) return { version, status: "error", message: "Parcheggio non trovato.", values: raw };

  const users = await listUserOptions();
  const { values, errors } = validateFacility(form, new Set(users.map((user) => user.id)));
  if (!values) {
    return {
      version,
      status: "error",
      message: "Controlla i campi evidenziati.",
      fieldErrors: errors,
      values: raw,
    };
  }

  // Geocoding (OpenStreetMap Nominatim): when the address changed, propose
  // the coordinates found and save them only after the administrator confirms.
  const decision = field(form, "geo");
  let source: "nominatim" | "manuale" | null = null;
  if (decision === "accept") {
    const lat = parseDecimal(field(form, "geo_lat"));
    const lng = parseDecimal(field(form, "geo_lng"));
    if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) {
      return { version, status: "error", message: "Coordinate proposte non valide: riprova.", values: raw };
    }
    values.lat = lat;
    values.lng = lng;
    source = "nominatim";
  } else {
    const address = facilityAddress(values);
    const addressChanged = !existing || address !== facilityAddress(existing);
    if (decision !== "skip" && addressChanged) {
      const result = await geocodeAddress(address);
      if (result.kind === "found") {
        return {
          version,
          status: "confirm-geocode",
          values: raw,
          geocode: { formattedAddress: result.formattedAddress, lat: result.lat, lng: result.lng },
        };
      }
      return {
        version,
        status: "geocode-failed",
        message:
          result.kind === "not-found"
            ? "OpenStreetMap non ha trovato questo indirizzo. Controllalo, oppure inserisci latitudine e longitudine a mano e salva."
            : "La ricerca delle coordinate non è riuscita. Inserisci latitudine e longitudine a mano e salva.",
        values: raw,
      };
    }
    const coordinatesChanged = !existing || values.lat !== existing.lat || values.lng !== existing.lng;
    if (coordinatesChanged && values.lat !== null) source = "manuale";
  }

  // Record where the coordinates come from whenever they change.
  const coordinatesTouched = source !== null || (existing !== null && existing.lat !== null && values.lat === null);
  const record = coordinatesTouched
    ? {
        ...values,
        coordinate_fonte: source,
        coordinate_aggiornate_il: source ? new Date().toISOString() : null,
      }
    : values;

  const supabase = await createClient();
  let savedId = id;
  if (existing) {
    const { data, error } = await supabase.from("parking_facilities").update(record).eq("id", id).select("id");
    if (error) return { version, status: "error", message: writeError(error.code), values: raw };
    if (data.length === 0) return { version, status: "error", message: NOT_ADMIN, values: raw };
  } else {
    const { data, error } = await supabase.from("parking_facilities").insert(record).select("id").single();
    if (error) return { version, status: "error", message: writeError(error.code), values: raw };
    savedId = data.id;
  }

  revalidatePath("/parcheggi");
  redirect(`/parcheggi/${savedId}`);
}

// Archive (or restore) without deleting: leads keep pointing to the car park.
export async function setFacilityArchived(
  id: string,
  archived: boolean,
): Promise<{ ok: boolean; message?: string }> {
  if (!(await requireAdmin())) return { ok: false, message: NOT_ADMIN };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parking_facilities")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, message: writeError(error.code) };
  if (data.length === 0) return { ok: false, message: NOT_ADMIN };

  revalidatePath("/parcheggi");
  revalidatePath(`/parcheggi/${id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export async function saveProduct(previous: FormState, form: FormData): Promise<FormState> {
  const version = previous.version + 1;
  const raw = readRawValues(form, PRODUCT_FIELDS);
  if (!(await requireAdmin())) return { version, status: "error", message: NOT_ADMIN, values: raw };

  const parkingId = field(form, "parking_id");
  const productId = field(form, "id");
  if (!parkingId || !(await getFacility(parkingId))) {
    return { version, status: "error", message: "Parcheggio non trovato.", values: raw };
  }

  const { values, errors } = validateProduct(form);
  if (!values) {
    return { version, status: "error", message: "Controlla i campi evidenziati.", fieldErrors: errors, values: raw };
  }

  const supabase = await createClient();
  if (productId) {
    const { data, error } = await supabase
      .from("parking_products")
      .update(values)
      .eq("id", productId)
      .eq("parking_id", parkingId)
      .select("id");
    if (error) return { version, status: "error", message: writeError(error.code), values: raw };
    if (data.length === 0) return { version, status: "error", message: NOT_ADMIN, values: raw };
  } else {
    const { error } = await supabase.from("parking_products").insert({ ...values, parking_id: parkingId });
    if (error) return { version, status: "error", message: writeError(error.code), values: raw };
  }

  revalidatePath(`/parcheggi/${parkingId}`);
  redirect(`/parcheggi/${parkingId}#listino`);
}

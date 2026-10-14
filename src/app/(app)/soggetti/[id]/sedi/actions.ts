"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { geocodeAddress } from "@/lib/geo/nominatim";
import { GoogleApiError, placeLocation } from "@/lib/google/places-api";
import { facilityAddress } from "@/lib/parking/validation";
import { getLocation } from "@/lib/parties/queries";
import { stopwatch } from "@/lib/server-timing";
import { createClient } from "@/lib/supabase/server";

// Coordinates of a party location: "Aggiorna" re-reads Google coordinates
// (30-day rule), "Conferma indirizzo" moves the location to Nominatim
// coordinates, out of the Google cycle.

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const NOT_ALLOWED = "Non hai i permessi per questa operazione.";
const UUID = /^[0-9a-f-]{36}$/i;

async function location(partyId: string, locationId: string) {
  if (!UUID.test(partyId) || !UUID.test(locationId)) return null;
  return getLocation(partyId, locationId);
}

export async function refreshLocationCoordinates(partyId: string, locationId: string): Promise<Result<{ found: boolean }>> {
  const time = stopwatch("sede.aggiorna_coordinate");
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  const current = await location(partyId, locationId);
  if (!current || current.coordinate_fonte !== "google") return { ok: false, message: "Questa sede non ha coordinate Google da aggiornare." };
  const supabase = await createClient();
  const { data: ref } = await supabase
    .from("external_references")
    .select("id_esterno")
    .eq("sistema", "google_places")
    .eq("entita", "parties")
    .eq("entita_id", partyId)
    .maybeSingle();
  if (!ref) return { ok: false, message: "Il soggetto non ha un riferimento Google: usa Conferma indirizzo." };
  try {
    const { data: quota, error } = await supabase.rpc("use_api_quota", { p_sku: "place_details_essentials", p_n: 1 });
    if (error || !(quota as { ok?: boolean } | null)?.ok) return { ok: false, message: "Limite delle chiamate Google raggiunto: riprova domani." };
    const point = await placeLocation(ref.id_esterno);
    time.step("google");
    const { error: applyError } = await supabase.rpc("apply_google_coordinates", {
      p_rows: [{ location_id: locationId, lat: point?.lat ?? null, lng: point?.lng ?? null }] as never,
    });
    if (applyError) throw new Error(applyError.code ?? applyError.message);
    time.log({ trovato: point ? 1 : 0 });
    revalidatePath(`/soggetti/${partyId}`);
    return { ok: true, data: { found: Boolean(point) } };
  } catch (error) {
    time.log({ errore: 1 });
    return {
      ok: false,
      message: error instanceof GoogleApiError ? "Google non ha risposto: riprova più tardi." : "Aggiornamento non riuscito: riprova.",
    };
  }
}

export type AddressProposal = { formattedAddress: string; lat: number; lng: number };

// Step 1: Nominatim on the saved address; nothing is written.
export async function proposeAddressCoordinates(partyId: string, locationId: string): Promise<Result<AddressProposal>> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  const current = await location(partyId, locationId);
  if (!current) return { ok: false, message: "Sede non trovata." };
  const text = facilityAddress({ indirizzo: current.indirizzo, cap: current.cap, citta: current.citta });
  if (!text) return { ok: false, message: "La sede non ha un indirizzo: modificala e inseriscilo." };
  const result = await geocodeAddress(text);
  if (result.kind === "found") return { ok: true, data: { formattedAddress: result.formattedAddress, lat: result.lat, lng: result.lng } };
  return {
    ok: false,
    message:
      result.kind === "not-found"
        ? "OpenStreetMap non ha trovato questo indirizzo: correggilo con Modifica sede."
        : "La ricerca delle coordinate non è riuscita: riprova.",
  };
}

// Step 2: the user confirmed the proposal.
export async function confirmAddressCoordinates(
  partyId: string,
  locationId: string,
  proposal: { lat: number; lng: number },
): Promise<Result<null>> {
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  const current = await location(partyId, locationId);
  if (!current) return { ok: false, message: "Sede non trovata." };
  const { lat, lng } = proposal ?? {};
  if (typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { ok: false, message: "Coordinate proposte non valide: riprova." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("party_locations")
    .update({ lat, lng, coordinate_fonte: "nominatim", coordinate_aggiornate_il: new Date().toISOString() })
    .eq("id", locationId)
    .eq("party_id", partyId);
  if (error) return { ok: false, message: "Salvataggio non riuscito: riprova." };
  revalidatePath(`/soggetti/${partyId}`);
  return { ok: true, data: null };
}

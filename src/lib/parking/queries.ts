import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import { isOneOf, CAMPAIGN_STATUS_LABELS, type CampaignStatus } from "./labels";

// Reads for the car park screens. Run with the signed-in user's session, so
// row level security decides what comes back.

export type FacilityListItem = Pick<
  Tables<"parking_facilities">,
  "id" | "nome" | "tipo" | "citta" | "posti_commerciali" | "stato_campagna" | "archived_at"
> & { responsabile: string | null };

export type Facility = Tables<"parking_facilities"> & { responsabile: string | null; note_autore?: string | null };

export type Product = Tables<"parking_products">;

export type UserOption = { id: string; label: string };

type UserRef = { nome: string | null; email: string } | null;

function userLabel(user: UserRef): string | null {
  return user ? user.nome?.trim() || user.email : null;
}

export type FacilityFilters = { stato: CampaignStatus | null; showArchived: boolean };

export function readFacilityFilters(params: Record<string, string | string[] | undefined>): FacilityFilters {
  const stato = params.stato;
  return {
    stato: isOneOf(CAMPAIGN_STATUS_LABELS, stato) ? stato : null,
    showArchived: params.archiviati === "1",
  };
}

export async function listFacilities(filters: FacilityFilters): Promise<FacilityListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("parking_facilities")
    .select(
      "id, nome, tipo, citta, posti_commerciali, stato_campagna, archived_at, responsabile:users!parking_facilities_responsabile_id_fkey(nome, email)",
    )
    .order("nome");
  if (filters.stato) query = query.eq("stato_campagna", filters.stato);
  if (!filters.showArchived) query = query.is("archived_at", null);

  const { data, error } = await query;
  if (error) throw new Error(`parking_facilities: ${error.code ?? error.message}`);
  return data.map(({ responsabile, ...row }) => ({ ...row, responsabile: userLabel(responsabile) }));
}

export async function getFacility(id: string): Promise<Facility | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parking_facilities")
    .select(
      "*, responsabile:users!parking_facilities_responsabile_id_fkey(nome, email), note_autore:users!parking_facilities_note_modificate_da_fkey(nome, email)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`parking_facilities: ${error.code ?? error.message}`);
  if (!data) return null;
  const { responsabile, note_autore, ...row } = data;
  return { ...row, responsabile: userLabel(responsabile), note_autore: userLabel(note_autore) };
}

export async function listProducts(parkingId: string): Promise<Product[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parking_products")
    .select("*")
    .eq("parking_id", parkingId)
    .order("attivo", { ascending: false })
    .order("nome");
  if (error) throw new Error(`parking_products: ${error.code ?? error.message}`);
  return data;
}

export async function getProduct(parkingId: string, productId: string): Promise<Product | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parking_products")
    .select("*")
    .eq("parking_id", parkingId)
    .eq("id", productId)
    .maybeSingle();
  if (error) throw new Error(`parking_products: ${error.code ?? error.message}`);
  return data;
}

// Active users, for the "responsabile" select.
export async function listUserOptions(): Promise<UserOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("users").select("id, nome, email").eq("attivo", true).order("nome");
  if (error) throw new Error(`users: ${error.code ?? error.message}`);
  return data.map((user) => ({ id: user.id, label: userLabel(user) ?? user.email }));
}

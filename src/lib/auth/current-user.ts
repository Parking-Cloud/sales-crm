import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type UserRole = Database["public"]["Enums"]["user_role"];

export type CurrentUser = {
  id: string;
  name: string;
  role: UserRole;
  // For showing or hiding write actions only: permissions are enforced by RLS.
  isAdmin: boolean;
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Amministratore",
  operatore: "Operatore",
};

// The signed-in CRM user, or null when there is no linked, active account.
// The middleware has already redirected such requests; this is the fallback.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from("users")
    .select("nome, email, ruolo, attivo")
    .eq("id", userId)
    .maybeSingle();
  if (!data || !data.attivo) return null;

  return {
    id: userId,
    name: data.nome?.trim() || data.email,
    role: data.ruolo,
    isAdmin: data.ruolo === "admin",
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SUPPRESSION_TYPES, isOppositionChannel } from "@/lib/suppression/labels";
import { createClient } from "@/lib/supabase/server";

// Suppression list (C2): manual entries by administrators from this page
// (the database accepts them from every active user, as "Non contattare"
// does); removal by administrators only, with a reason.

type Result = { ok: true } | { ok: false; message: string };

const NOT_ADMIN = "Solo l'amministratore può modificare la lista di esclusione.";
const UUID = /^[0-9a-f-]{36}$/i;

export async function addSuppression(input: { tipo: string; valore: string; motivo: string; canale: string }): Promise<Result> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { ok: false, message: NOT_ADMIN };
  if (!(SUPPRESSION_TYPES as readonly string[]).includes(input?.tipo)) return { ok: false, message: "Scegli il tipo di valore." };
  if (!input.valore?.trim()) return { ok: false, message: "Scrivi il valore da escludere." };
  if (!input.motivo?.trim()) return { ok: false, message: "Scrivi il motivo." };
  if (input.canale && !isOppositionChannel(input.canale)) return { ok: false, message: "Canale non valido." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_suppression", {
    p_tipo: input.tipo as (typeof SUPPRESSION_TYPES)[number],
    p_valore: input.valore.trim().slice(0, 300),
    p_motivo: input.motivo.trim().slice(0, 1000),
    p_canale: input.canale || undefined,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, message: "Questo valore è già in lista di esclusione." };
    if (error.code === "22023") {
      return {
        ok: false,
        message: error.message?.includes("generic")
          ? "Domini di posta generici (gmail.com, libero.it…) non si escludono: escludi l'indirizzo email."
          : "Valore non valido per il tipo scelto.",
      };
    }
    return { ok: false, message: error.code === "42501" ? NOT_ADMIN : "Salvataggio non riuscito. Riprova." };
  }
  revalidatePath("/esclusioni");
  return { ok: true };
}

export async function removeSuppression(id: string, motivo: string): Promise<Result> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { ok: false, message: NOT_ADMIN };
  if (!UUID.test(id ?? "")) return { ok: false, message: "Voce non trovata." };
  if (!motivo?.trim()) return { ok: false, message: "Scrivi il motivo della rimozione." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_suppression", { p_id: id, p_motivo: motivo.trim().slice(0, 1000) });
  if (error) {
    if (error.code === "P0002") return { ok: false, message: "Voce non trovata, già rimossa o lasciata da una cancellazione GDPR." };
    return { ok: false, message: error.code === "42501" ? NOT_ADMIN : "Rimozione non riuscita. Riprova." };
  }
  revalidatePath("/esclusioni");
  return { ok: true };
}

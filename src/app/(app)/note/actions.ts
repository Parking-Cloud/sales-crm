"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";

// Free notes on parties and car parks (A2), editable by every active user
// through save_notes(), which touches the note columns only.

type Result = { ok: true } | { ok: false; message: string };
const UUID = /^[0-9a-f-]{36}$/i;

export async function saveNotes(entita: "parties" | "parking_facilities", id: string, note: string): Promise<Result> {
  if (!(await getCurrentUser())) return { ok: false, message: "Non hai i permessi per questa operazione." };
  if ((entita !== "parties" && entita !== "parking_facilities") || !UUID.test(id)) return { ok: false, message: "Scheda non trovata." };
  const text = typeof note === "string" ? note : "";
  if (text.length > 5000) return { ok: false, message: "Le note possono avere al massimo 5.000 caratteri." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_notes", { p_entita: entita, p_id: id, p_note: text });
  if (error) return { ok: false, message: "Note non salvate. Riprova." };
  revalidatePath(entita === "parties" ? `/prospect/${id}` : `/parcheggi/${id}`);
  return { ok: true };
}

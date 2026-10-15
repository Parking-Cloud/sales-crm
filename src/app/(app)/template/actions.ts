"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { TEMPLATE_USES, unknownVariables, type TemplateUse } from "@/lib/email/template";
import { createClient } from "@/lib/supabase/server";

// Email templates (CRM-21), administrators only. Every save is a new version
// (public.save_email_template); unknown variables are refused here and again
// by the database.

export type TemplateFormState = {
  version: number;
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: { nome: string; uso: string; oggetto: string; corpo: string };
};

const NOT_ADMIN = "Solo l'amministratore gestisce i template.";
const UUID = /^[0-9a-f-]{36}$/i;

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

function unknownMessage(names: string[]): string {
  return `Variabili sconosciute: ${names.map((name) => `{${name}}`).join(", ")}. Usa solo quelle dell'elenco.`;
}

export async function saveTemplate(previous: TemplateFormState, form: FormData): Promise<TemplateFormState> {
  const version = previous.version + 1;
  const values = { nome: text(form, "nome").trim(), uso: text(form, "uso"), oggetto: text(form, "oggetto").trim(), corpo: text(form, "corpo") };
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { version, status: "error", message: NOT_ADMIN, values };

  const famiglia = text(form, "famiglia");
  if (famiglia && !UUID.test(famiglia)) return { version, status: "error", message: "Template non trovato.", values };

  const errors: Record<string, string> = {};
  if (!values.nome) errors.nome = "Scrivi il nome del template.";
  else if (values.nome.length > 120) errors.nome = "Al massimo 120 caratteri.";
  if (!(TEMPLATE_USES as readonly string[]).includes(values.uso)) errors.uso = "Scegli l'uso.";
  if (!values.oggetto) errors.oggetto = "Scrivi l'oggetto.";
  else if (values.oggetto.length > 200) errors.oggetto = "Al massimo 200 caratteri.";
  if (!values.corpo.trim()) errors.corpo = "Scrivi il testo.";
  else if (values.corpo.length > 20000) errors.corpo = "Al massimo 20.000 caratteri.";
  const unknownSubject = unknownVariables(values.oggetto);
  const unknownBody = unknownVariables(values.corpo);
  if (unknownSubject.length > 0) errors.oggetto = unknownMessage(unknownSubject);
  if (unknownBody.length > 0) errors.corpo = unknownMessage(unknownBody);
  if (Object.keys(errors).length > 0) return { version, status: "error", message: "Controlla i campi evidenziati.", fieldErrors: errors, values };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_email_template", {
    // Null: a new template.
    p_famiglia: (famiglia || null) as string,
    p_nome: values.nome,
    p_uso: values.uso as TemplateUse,
    p_oggetto: values.oggetto,
    p_corpo: values.corpo,
  });
  if (error) {
    if (error.code === "23514" && error.message?.includes("unknown template variables")) {
      return { version, status: "error", message: `Il database ha rifiutato il testo: ${error.message.replace("unknown template variables:", "variabili sconosciute")}.`, values };
    }
    return {
      version,
      status: "error",
      message: error.code === "42501" ? NOT_ADMIN : "Salvataggio non riuscito. Riprova; se il problema continua, avvisa l'amministratore.",
      values,
    };
  }
  const { data: saved } = await supabase.from("email_templates").select("famiglia_id, versione").eq("id", data as string).single();
  revalidatePath("/template");
  redirect(`/template/${saved?.famiglia_id}?salvata=${saved?.versione}`);
}

// Turns a template off (no longer offered in "Prepara email") or back on.
export async function setTemplateActive(famigliaId: string, attivo: boolean): Promise<{ ok: true; data: null } | { ok: false; message: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { ok: false, message: NOT_ADMIN };
  if (!UUID.test(famigliaId ?? "")) return { ok: false, message: "Template non trovato." };
  const supabase = await createClient();
  const { error } = await supabase.from("email_templates").update({ attivo: Boolean(attivo) }).eq("famiglia_id", famigliaId);
  if (error) return { ok: false, message: error.code === "42501" ? NOT_ADMIN : "Operazione non riuscita. Riprova." };
  revalidatePath("/template");
  revalidatePath(`/template/${famigliaId}`);
  return { ok: true, data: null };
}

// "Usa questa versione": the version "Prepara email" uses (block 1a-8).
export async function activateTemplateVersion(id: string): Promise<{ ok: true; data: null } | { ok: false; message: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { ok: false, message: NOT_ADMIN };
  if (!UUID.test(id ?? "")) return { ok: false, message: "Versione non trovata." };
  const supabase = await createClient();
  const { data: version } = await supabase.from("email_templates").select("famiglia_id").eq("id", id).maybeSingle();
  const { error } = await supabase.rpc("use_template_version", { p_id: id });
  if (error) return { ok: false, message: error.code === "42501" ? NOT_ADMIN : "Operazione non riuscita. Riprova." };
  revalidatePath("/template");
  if (version) revalidatePath(`/template/${version.famiglia_id}`);
  return { ok: true, data: null };
}

// Deletes a version never used by an email and not active.
export async function deleteTemplateVersion(id: string): Promise<{ ok: true; data: null } | { ok: false; message: string }> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return { ok: false, message: NOT_ADMIN };
  if (!UUID.test(id ?? "")) return { ok: false, message: "Versione non trovata." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("email_templates").delete().eq("id", id).select("famiglia_id");
  if (error) {
    if (error.message?.includes("active")) return { ok: false, message: "La versione attiva non si elimina: prima scegline un'altra." };
    if (error.message?.includes("used by an email")) return { ok: false, message: "Questa versione è stata usata in un'email: resta in sola lettura." };
    return { ok: false, message: error.code === "42501" ? NOT_ADMIN : "Eliminazione non riuscita. Riprova." };
  }
  if (!data || data.length === 0) return { ok: false, message: "Versione non trovata." };
  revalidatePath("/template");
  revalidatePath(`/template/${data[0].famiglia_id}`);
  return { ok: true, data: null };
}

import { createClient } from "@/lib/supabase/server";
import { SUPPRESSION_TYPES, type SuppressionType } from "./labels";

// Reads of the suppression list for /esclusioni (RLS: every active user).

export const SUPPRESSION_PAGE_SIZE = 50;

export type SuppressionFilters = { tipo: SuppressionType | null; q: string; rimosse: boolean; page: number };

export function readSuppressionFilters(params: Record<string, string | string[] | undefined>): SuppressionFilters {
  const one = (name: string) => (typeof params[name] === "string" ? (params[name] as string).trim() : "");
  const tipo = one("tipo");
  const page = Number.parseInt(one("pagina"), 10);
  return {
    tipo: (SUPPRESSION_TYPES as readonly string[]).includes(tipo) ? (tipo as SuppressionType) : null,
    q: one("q").slice(0, 120),
    rimosse: one("rimosse") === "1",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function suppressionHref(filters: SuppressionFilters, page = 1): string {
  const params = new URLSearchParams();
  if (filters.tipo) params.set("tipo", filters.tipo);
  if (filters.q) params.set("q", filters.q);
  if (filters.rimosse) params.set("rimosse", "1");
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return query ? `/esclusioni?${query}` : "/esclusioni";
}

export type SuppressionEntry = {
  id: string;
  tipo: SuppressionType;
  // Null for entries left by a GDPR erasure (hash only).
  valore: string | null;
  motivo: string | null;
  canale: string | null;
  gdpr: boolean;
  creataIl: string;
  autore: string | null;
  rimossaIl: string | null;
  rimossaDa: string | null;
  motivoRimozione: string | null;
};

type UserRef = { nome: string | null; email: string } | null;
const userName = (user: UserRef) => (user ? user.nome?.trim() || user.email : null);

export async function listSuppression(filters: SuppressionFilters): Promise<{ items: SuppressionEntry[]; total: number }> {
  const supabase = await createClient();
  let query = supabase
    .from("suppression_list")
    .select(
      "id, tipo, valore_normalizzato, motivo, canale, gdpr, created_at, rimossa_il, motivo_rimozione, " +
        "autore:users!suppression_list_created_by_fkey(nome, email), rimossa:users!suppression_list_rimossa_da_fkey(nome, email)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range((filters.page - 1) * SUPPRESSION_PAGE_SIZE, filters.page * SUPPRESSION_PAGE_SIZE - 1);
  if (!filters.rimosse) query = query.is("rimossa_il", null);
  if (filters.tipo) query = query.eq("tipo", filters.tipo);
  if (filters.q) query = query.ilike("valore_normalizzato", `%${filters.q.toLowerCase().replace(/[%_\\]/g, "\\$&")}%`);
  const { data, error, count } = await query;
  if (error) throw new Error(`suppression_list: ${error.code ?? error.message}`);
  const rows = (data ?? []) as unknown as {
    id: string;
    tipo: SuppressionType;
    valore_normalizzato: string | null;
    motivo: string | null;
    canale: string | null;
    gdpr: boolean;
    created_at: string;
    rimossa_il: string | null;
    motivo_rimozione: string | null;
    autore: UserRef;
    rimossa: UserRef;
  }[];
  return {
    total: count ?? rows.length,
    items: rows.map((row) => ({
      id: row.id,
      tipo: row.tipo,
      valore: row.valore_normalizzato,
      motivo: row.motivo,
      canale: row.canale,
      gdpr: row.gdpr,
      creataIl: row.created_at,
      autore: userName(row.autore),
      rimossaIl: row.rimossa_il,
      rimossaDa: userName(row.rimossa),
      motivoRimozione: row.motivo_rimozione,
    })),
  };
}

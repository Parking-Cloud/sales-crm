"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth/current-user";
import { GoogleApiError, importDetails, nearbySearch, walkingMatrix } from "@/lib/google/places-api";
import { CATEGORY_TYPES, SEARCH_CATEGORIES, categoryForPlace, isSearchCategory, type SearchCategory } from "@/lib/places/categories";
import { MAX_IMPORT, MAX_RADIUS, MAX_WALKING, MIN_RADIUS } from "@/lib/places/limits";
import { capAndCity, searchArea } from "@/lib/places/search";
import type {
  DuplicateCandidate,
  ImportCandidate,
  ImportChoice,
  ImportOutcome,
  ImportSummary,
  ResultStatus,
  SearchResponse,
  SearchResult,
  WalkingDistance,
} from "@/lib/places/types";
import { stopwatch } from "@/lib/server-timing";
import { createClient } from "@/lib/supabase/server";

// Map search (CRM-04…CRM-07), for administrators and operators. Google is
// called only from here, with the server key. Every billed request is first
// reserved on the daily limit (use_api_quota). Each action logs durations
// and counts, never data.

type Result<T> = { ok: true; data: T } | { ok: false; message: string };

const PARALLEL = 8;

const NOT_ALLOWED = "Non hai i permessi per questa operazione.";
const QUOTA_NEARBY = "Limite giornaliero delle ricerche Google raggiunto: la ricerca è bloccata fino a domani. L'amministratore può alzare il limite in Impostazioni.";
const QUOTA_DETAILS = "Limite giornaliero dei dettagli Google raggiunto: l'import è bloccato fino a domani. L'amministratore può alzare il limite in Impostazioni.";
const UUID = /^[0-9a-f-]{36}$/i;

type Sku = "nearby_search_pro" | "place_details_enterprise" | "route_matrix_essentials";

async function reserve(sku: Sku, n: number): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("use_api_quota", { p_sku: sku, p_n: n });
  if (error) throw new Error(`use_api_quota: ${error.code ?? error.message}`);
  return Boolean((data as { ok?: boolean } | null)?.ok);
}

function googleMessage(error: unknown): string {
  if (error instanceof GoogleApiError) {
    if (error.googleStatus === "MISSING_KEY") return "La chiave Google del server non è configurata: avvisa l'amministratore.";
    if (error.httpStatus === 403) return "Google ha rifiutato la richiesta (chiave non abilitata o con restrizioni sbagliate): avvisa l'amministratore.";
    if (error.httpStatus === 429) return "Google ha ricevuto troppe richieste: riprova tra qualche minuto.";
  }
  return "Google non ha risposto: riprova tra qualche minuto.";
}

async function searchParking(parkingId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parking_facilities")
    .select("id, nome, lat, lng")
    .eq("id", parkingId)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw new Error(`parking_facilities: ${error.code ?? error.message}`);
  return data && data.lat !== null && data.lng !== null ? { id: data.id, nome: data.nome, lat: data.lat, lng: data.lng } : null;
}

// One group of types per category, without types already in an earlier
// group ("Aziende" adds nothing when "Uffici" is searched too).
function typeGroups(categories: readonly SearchCategory[]): string[][] {
  const seen = new Set<string>();
  return categories
    .map((category) => CATEGORY_TYPES[category].filter((type) => (seen.has(type) ? false : (seen.add(type), true))))
    .filter((group) => group.length > 0);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchPlaces(input: { parkingId: string; radius: number; categories: string[] }): Promise<Result<SearchResponse>> {
  const time = stopwatch("ricerca.mappa");
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  const radius = Math.round(Number(input?.radius));
  if (!Number.isFinite(radius) || radius < MIN_RADIUS || radius > MAX_RADIUS) {
    return { ok: false, message: "Il raggio va da 100 m a 5 km." };
  }
  const chosen = Array.isArray(input?.categories) ? input.categories.filter(isSearchCategory) : [];
  const categories = chosen.length > 0 ? SEARCH_CATEGORIES.filter((category) => chosen.includes(category)) : [];
  if (categories.length === 0) return { ok: false, message: "Scegli almeno una categoria." };
  if (typeof input?.parkingId !== "string" || !UUID.test(input.parkingId)) return { ok: false, message: "Scegli un parcheggio." };

  try {
    const parking = await searchParking(input.parkingId);
    if (!parking) return { ok: false, message: "Parcheggio non trovato o senza coordinate." };
    time.step("parcheggio");

    const area = await searchArea({
      center: { lat: parking.lat, lng: parking.lng },
      radius,
      typeGroups: typeGroups(categories),
      call: nearbySearch,
      reserve: (n) => reserve("nearby_search_pro", n),
    });
    time.step("google");
    if (area.quotaExceeded && area.places.length === 0) {
      time.log({ chiamate: area.calls, risultati: 0, limite: 1 });
      return { ok: false, message: QUOTA_NEARBY };
    }

    const supabase = await createClient();
    const { data: statuses, error } = await supabase.rpc("check_places", {
      p_places: area.places.map((place) => ({ place_id: place.id, nome: place.name, ...capAndCity(place.address) })) as never,
    });
    if (error) throw new Error(`check_places: ${error.code ?? error.message}`);
    time.step("crm");
    const byId = new Map((statuses ?? []).map((row) => [row.place_id, row]));

    const results: SearchResult[] = area.places.map((place) => {
      const status = byId.get(place.id);
      return {
        placeId: place.id,
        name: place.name,
        address: place.address,
        lat: place.location.lat,
        lng: place.location.lng,
        distance: place.distance,
        category: categoryForPlace(place.primaryType, place.types, categories),
        status: (status?.stato as ResultStatus | undefined) ?? "nuovo",
        partyId: status?.party_id ?? null,
        partyName: status?.nome ?? null,
        reason: status?.motivo ?? null,
      };
    });
    time.log({ chiamate: area.calls, risultati: results.length, parziale: area.partial ? 1 : 0, limite: area.quotaExceeded ? 1 : 0 });
    return {
      ok: true,
      data: {
        center: { lat: parking.lat, lng: parking.lng },
        radius,
        parkingId: parking.id,
        parkingName: parking.nome,
        categories,
        results,
        calls: area.calls,
        partial: area.partial || area.quotaExceeded,
      },
    };
  } catch (error) {
    time.log({ errore: 1 });
    return { ok: false, message: googleMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Walking distance (CRM-05): shown, never saved
// ---------------------------------------------------------------------------

export async function walkingDistances(input: {
  parkingId: string;
  places: { placeId: string; lat: number; lng: number }[];
}): Promise<Result<WalkingDistance[]>> {
  const time = stopwatch("ricerca.distanza_a_piedi");
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  const places = (Array.isArray(input?.places) ? input.places : []).filter(
    (place) => typeof place?.placeId === "string" && Number.isFinite(place.lat) && Number.isFinite(place.lng),
  );
  if (places.length === 0) return { ok: false, message: "Seleziona almeno un risultato." };
  if (places.length > MAX_WALKING) return { ok: false, message: `Al massimo ${MAX_WALKING} risultati per volta.` };
  try {
    const parking = typeof input.parkingId === "string" && UUID.test(input.parkingId) ? await searchParking(input.parkingId) : null;
    if (!parking) return { ok: false, message: "Parcheggio non trovato o senza coordinate." };
    // Route Matrix is billed per element: one origin x n destinations.
    if (!(await reserve("route_matrix_essentials", places.length))) {
      return { ok: false, message: "Limite giornaliero delle chiamate Google raggiunto: riprova domani." };
    }
    time.step("limite");
    const routes = await walkingMatrix(parking, places);
    time.step("google");
    const byIndex = new Map(routes.map((route) => [route.index, route]));
    const data = places.map((place, index) => {
      const route = byIndex.get(index);
      return {
        placeId: place.placeId,
        meters: route?.meters ?? null,
        minutes: route?.seconds !== null && route?.seconds !== undefined ? Math.max(1, Math.round(route.seconds / 60)) : null,
      };
    });
    time.log({ elementi: places.length, trovati: data.filter((item) => item.meters !== null).length });
    return { ok: true, data };
  } catch (error) {
    time.log({ errore: 1 });
    return { ok: false, message: googleMessage(error) };
  }
}

// ---------------------------------------------------------------------------
// Selective import (CRM-07)
// ---------------------------------------------------------------------------

type ChosenPlace = { placeId: string; name: string; category: string; lat: number; lng: number };

async function inBatches<T, R>(items: T[], task: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += PARALLEL) {
    out.push(...(await Promise.all(items.slice(i, i + PARALLEL).map((item, offset) => task(item, i + offset)))));
  }
  return out;
}

// Step 1: Place Details (phone, site, address: Enterprise SKU, so only now)
// and the duplicate check with those data. Nothing is written.
export async function prepareImport(input: { places: ChosenPlace[] }): Promise<Result<ImportCandidate[]>> {
  const time = stopwatch("ricerca.import_dettagli");
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  const places = (Array.isArray(input?.places) ? input.places : []).filter(
    (place) => typeof place?.placeId === "string" && typeof place.name === "string" && Number.isFinite(place.lat) && Number.isFinite(place.lng),
  );
  if (places.length === 0) return { ok: false, message: "Seleziona almeno un risultato." };
  if (places.length > MAX_IMPORT) return { ok: false, message: `Al massimo ${MAX_IMPORT} risultati per volta.` };
  try {
    if (!(await reserve("place_details_enterprise", places.length))) return { ok: false, message: QUOTA_DETAILS };
    time.step("limite");
    const details = await inBatches(places, (place) => importDetails(place.placeId));
    time.step("google");

    const supabase = await createClient();
    const candidates = await inBatches(places, async (place, index): Promise<ImportCandidate> => {
      const detail = details[index];
      const category: SearchCategory | "Altro" = isSearchCategory(place.category) ? place.category : "Altro";
      const base = { placeId: place.placeId, name: place.name.trim().slice(0, 200), category, lat: place.lat, lng: place.lng };
      if (!detail) {
        return { ...base, telefono: null, sito: null, indirizzo: null, cap: null, citta: null, check: "sparito", reason: "Il luogo non esiste più su Google", candidates: [] };
      }
      const { data, error } = await supabase.rpc("check_party_duplicates", {
        p_denominazione: base.name,
        p_place_id: place.placeId,
        p_telefono: detail.telefono ?? undefined,
        p_sito: detail.sito ?? undefined,
        p_cap: detail.cap ?? undefined,
        p_citta: detail.citta ?? undefined,
      });
      if (error) throw new Error(`check_party_duplicates: ${error.code ?? error.message}`);
      const block = (data ?? []).find((row) => row.livello === "blocco");
      const warnings = (data ?? []).filter((row) => row.livello === "avviso" && row.party_id);
      const byParty = new Map<string, DuplicateCandidate>();
      warnings.forEach((row) => {
        if (row.party_id && !byParty.has(row.party_id)) {
          byParty.set(row.party_id, { partyId: row.party_id, name: row.nome ?? "Soggetto senza nome", reason: row.motivo });
        }
      });
      const list = [...byParty.values()];
      return {
        ...base,
        ...detail,
        check: block ? "blocco" : list.length > 0 ? "avviso" : "nuovo",
        reason: block ? block.motivo : (list[0]?.reason ?? null),
        candidates: block ? [] : list,
      };
    });
    time.step("doppioni");
    time.log({
      dettagli: places.length,
      nuovi: candidates.filter((item) => item.check === "nuovo").length,
      avvisi: candidates.filter((item) => item.check === "avviso").length,
      blocchi: candidates.filter((item) => item.check === "blocco").length,
    });
    return { ok: true, data: candidates };
  } catch (error) {
    time.log({ errore: 1 });
    return { ok: false, message: googleMessage(error) };
  }
}

// Step 2: the import, in one transaction (import_places checks duplicates
// again and never creates a blocked one).
export async function confirmImport(input: {
  parkingId: string;
  candidates: ImportCandidate[];
  choices: ImportChoice[];
}): Promise<Result<ImportSummary>> {
  const time = stopwatch("ricerca.import");
  if (!(await getCurrentUser())) return { ok: false, message: NOT_ALLOWED };
  if (typeof input?.parkingId !== "string" || !UUID.test(input.parkingId)) return { ok: false, message: "Parcheggio non trovato." };
  const candidates = (Array.isArray(input?.candidates) ? input.candidates : []).filter((item) => item && item.check !== "blocco" && item.check !== "sparito");
  if (candidates.length === 0) return { ok: false, message: "Niente da importare." };
  if (candidates.length > MAX_IMPORT) return { ok: false, message: `Al massimo ${MAX_IMPORT} risultati per volta.` };
  const choices = new Map((Array.isArray(input.choices) ? input.choices : []).map((choice) => [choice.placeId, choice]));
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : null);

  const rows = candidates.map((item) => {
    const choice = choices.get(item.placeId);
    const target = choice?.unisciA && UUID.test(choice.unisciA) ? choice.unisciA : null;
    return {
      place_id: text(item.placeId),
      nome: text(item.name),
      categoria: isSearchCategory(item.category) ? item.category : "Altro",
      telefono: text(item.telefono),
      sito: text(item.sito),
      indirizzo: text(item.indirizzo),
      cap: text(item.cap),
      citta: text(item.citta),
      lat: Number.isFinite(item.lat) ? item.lat : null,
      lng: Number.isFinite(item.lng) ? item.lng : null,
      scelta: choice?.scelta === "crea" || choice?.scelta === "unisci" ? choice.scelta : null,
      unisci_a: target,
    };
  });

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("import_places", { p_parking: input.parkingId, p_rows: rows as never });
    time.step("database");
    if (error) {
      time.log({ righe: rows.length, errore: 1 });
      return { ok: false, message: "Import non riuscito: nessun soggetto è stato creato. Riprova." };
    }
    const raw = (data ?? {}) as { creati?: number; aggiunti?: number; saltati?: number; righe?: Record<string, unknown>[] };
    const righe: ImportOutcome[] = (raw.righe ?? []).map((row) => ({
      placeId: String(row.place_id ?? ""),
      name: typeof row.nome === "string" ? row.nome : "Senza nome",
      esito: (["creato", "aggiunto", "saltato", "da_decidere"].includes(String(row.esito)) ? row.esito : "saltato") as ImportOutcome["esito"],
      reason: typeof row.motivo === "string" ? row.motivo : null,
      partyId: typeof row.party_id === "string" ? row.party_id : null,
    }));
    const summary = { creati: raw.creati ?? 0, aggiunti: raw.aggiunti ?? 0, saltati: raw.saltati ?? 0, righe };
    time.log({ righe: rows.length, creati: summary.creati, aggiunti: summary.aggiunti, saltati: summary.saltati });
    revalidatePath("/soggetti");
    return { ok: true, data: summary };
  } catch {
    time.log({ righe: rows.length, errore: 1 });
    return { ok: false, message: "Import non riuscito: nessun soggetto è stato creato. Riprova." };
  }
}

/**
 * Checks the Google place types of src/lib/places/categories.ts against
 * Table A of Places API (New), asking the API itself at no cost: one Nearby
 * Search with all the types plus a type that cannot exist is refused
 * (INVALID_ARGUMENT, not billed), and the error lists the unsupported types.
 *
 *   npm run google:check-types
 *
 * Needs GOOGLE_MAPS_SERVER_KEY. Prints the types only, never the key.
 */
import { join } from "node:path";

const SENTINEL = "zz_tipo_inesistente_crm";

async function main(): Promise<void> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new Error("variabile GOOGLE_MAPS_SERVER_KEY mancante.");
  // Compiled by `tsc -p tsconfig.test.json` (see package.json).
  const { CATEGORY_TYPES } = (await import(join(__dirname, "..", "..", ".test-dist", "src", "lib", "places", "categories.js"))) as {
    CATEGORY_TYPES: Record<string, string[]>;
  };
  const types = [...new Set(Object.values(CATEGORY_TYPES).flat())];

  const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id" },
    body: JSON.stringify({
      includedTypes: [...types, SENTINEL],
      maxResultCount: 1,
      locationRestriction: { circle: { center: { latitude: 45.4642, longitude: 9.19 }, radius: 10 } },
    }),
  });
  const body = (await response.json().catch(() => null)) as { error?: { status?: string; message?: string } } | null;
  if (response.ok) throw new Error("la richiesta non è stata rifiutata: controllo non riuscito (ed è stata fatturata una chiamata).");
  if (body?.error?.status !== "INVALID_ARGUMENT") {
    throw new Error(`risposta inattesa: HTTP ${response.status} ${body?.error?.status ?? ""}`.trim());
  }
  const message = body.error.message ?? "";
  const rejected = types.filter((type) => new RegExp(`\\b${type}\\b`).test(message));
  if (!new RegExp(`\\b${SENTINEL}\\b`).test(message)) throw new Error("risposta senza l'elenco dei tipi non supportati.");
  console.log(`Tipi controllati: ${types.length}`);
  console.log(rejected.length === 0 ? "Tutti i tipi sono validi (Table A)." : `Tipi NON validi: ${rejected.join(", ")}`);
  for (const [category, list] of Object.entries(CATEGORY_TYPES)) {
    const bad = list.filter((type) => rejected.includes(type));
    if (bad.length > 0) console.log(`  ${category}: ${bad.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(`Controllo non riuscito: ${error instanceof Error ? error.message : "errore sconosciuto"}`);
  process.exit(1);
});

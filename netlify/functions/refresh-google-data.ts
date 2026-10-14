// Netlify Scheduled Function: every night, Google coordinates older than 25
// days are re-read (30-day rule of the Google Maps Platform terms).
// Runs on the server with SUPABASE_SERVICE_ROLE_KEY and GOOGLE_MAPS_SERVER_KEY
// (Netlify environment variables). Logs counts only.
import { createClient } from "@supabase/supabase-js";
import { placeLocation } from "../../src/lib/google/places-api";
import { refreshGoogleData } from "../../src/lib/google/refresh";

export default async function handler(): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.GOOGLE_MAPS_SERVER_KEY) {
    console.error(JSON.stringify({ evento: "google.refresh", errore: "configurazione mancante" }));
    return new Response("configurazione mancante", { status: 500 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const start = Date.now();
  try {
    const result = await refreshGoogleData(supabase, placeLocation);
    console.info(JSON.stringify({ evento: "google.refresh", ms: Date.now() - start, ...result, limite: result.limite ? 1 : 0 }));
    return new Response("ok");
  } catch (error) {
    console.error(JSON.stringify({ evento: "google.refresh", ms: Date.now() - start, errore: error instanceof Error ? error.message.slice(0, 120) : "sconosciuto" }));
    return new Response("errore", { status: 500 });
  }
}

// Every night at 02:15 UTC (03:15 or 04:15 in Italy).
export const config = { schedule: "15 2 * * *" };

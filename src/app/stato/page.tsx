import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Stato" };

// Read env vars and ping Supabase on every request, never at build time.
export const dynamic = "force-dynamic";

const SUPABASE_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type Health =
  | { kind: "skipped" }
  | { kind: "ok" }
  | { kind: "error"; detail: string };

async function checkSupabase(url: string, anonKey: string): Promise<Health> {
  try {
    const response = await fetch(new URL("/auth/v1/health", url), {
      headers: { apikey: anonKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) return { kind: "ok" };
    return { kind: "error", detail: `risposta HTTP ${response.status}` };
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      kind: "error",
      detail: timedOut ? "nessuna risposta entro 5 secondi" : "richiesta non riuscita",
    };
  }
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-pill border px-3 py-1 text-caption font-medium",
        ok
          ? "border-success-line bg-success-surface text-success-ink"
          : "border-grey-80 bg-grey-40 text-black-80",
      ].join(" ")}
    >
      <span aria-hidden="true">{ok ? "✓" : "–"}</span>
      {label}
    </span>
  );
}

export default async function StatusPage() {
  const present = SUPABASE_VARS.map((name) => ({
    name,
    present: Boolean(process.env[name]),
  }));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const health: Health =
    url && anonKey ? await checkSupabase(url, anonKey) : { kind: "skipped" };

  return (
    <main className="mx-auto max-w-(--funnel-max) px-4 py-8 lg:py-12">
      <p className="text-caption text-black-60">
        <Link href="/oggi" className="rounded-xs text-blue-ink underline underline-offset-2">
          Torna all&apos;app
        </Link>
      </p>
      <h1 className="mt-2 text-h2 font-semibold leading-tight">Stato</h1>
      <p className="mt-2 text-body text-black-60">
        Controllo della configurazione. I valori delle variabili non vengono mai mostrati.
      </p>

      <section aria-labelledby="variabili" className="mt-8 rounded-md border border-grey-60 bg-white p-6 shadow-sm">
        <h2 id="variabili" className="text-h4 font-semibold">
          Variabili Supabase
        </h2>
        <ul className="mt-4 flex flex-col gap-3">
          {present.map((item) => (
            <li key={item.name} className="flex flex-wrap items-center justify-between gap-2">
              <code className="min-w-0 font-mono text-caption break-all">{item.name}</code>
              <StatusBadge ok={item.present} label={item.present ? "Presente" : "Assente"} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="connessione" className="mt-6 rounded-md border border-grey-60 bg-white p-6 shadow-sm">
        <h2 id="connessione" className="text-h4 font-semibold">
          Connessione a Supabase
        </h2>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <span className="text-body">Supabase raggiungibile</span>
          {health.kind === "ok" && <StatusBadge ok label="Sì" />}
          {health.kind === "error" && <StatusBadge ok={false} label="No" />}
          {health.kind === "skipped" && <StatusBadge ok={false} label="Non verificato" />}
        </div>
        <p className="mt-2 text-caption text-black-60">
          {health.kind === "skipped" &&
            "Variabili assenti: aggiungi URL e chiave anonima in .env.local per verificare la connessione."}
          {health.kind === "ok" && "Il servizio di autenticazione risponde."}
          {health.kind === "error" && `Il servizio di autenticazione non risponde: ${health.detail}.`}
        </p>
      </section>
    </main>
  );
}

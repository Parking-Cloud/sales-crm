/**
 * Minimal client for the Supabase Management API SQL endpoint, used by the
 * database scripts when SUPABASE_ACCESS_TOKEN is set:
 *
 *   POST https://api.supabase.com/v1/projects/{ref}/database/query
 *
 * The project ref is read from NEXT_PUBLIC_SUPABASE_URL and never printed.
 * One request runs as one implicit transaction: an error rolls back the whole
 * request. The response holds only the rows of the last statement.
 */

const API_BASE = "https://api.supabase.com/v1";

export class ScriptError extends Error {}

export function hasManagementApi(): boolean {
  return Boolean(process.env.SUPABASE_ACCESS_TOKEN);
}

function projectRef(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new ScriptError("variabile NEXT_PUBLIC_SUPABASE_URL mancante.");
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new ScriptError("NEXT_PUBLIC_SUPABASE_URL non è un indirizzo valido.");
  }
  const match = host.match(/^([a-z0-9]+)\.supabase\.co$/);
  if (!match) throw new ScriptError("NEXT_PUBLIC_SUPABASE_URL non è l'indirizzo di un progetto Supabase.");
  return match[1];
}

// Hides connection strings, passwords, tokens and email addresses in messages.
export function redact(message: string): string {
  return message
    .replace(/postgres(ql)?:\/\/\S+/gi, "<connessione>")
    .replace(/password=\S+/gi, "password=<nascosta>")
    .replace(/(bearer\s+)\S+/gi, "$1<nascosto>")
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "<email>")
    .trim();
}

export async function runSql<Row = Record<string, unknown>>(query: string): Promise<Row[]> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new ScriptError("variabile SUPABASE_ACCESS_TOKEN mancante.");

  const response = await fetch(`${API_BASE}/projects/${projectRef()}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(120_000),
  });

  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed.message === "string") message = parsed.message;
    } catch {
      // Not JSON: keep the raw text.
    }
    throw new ScriptError(`HTTP ${response.status}: ${redact(message)}`);
  }
  return JSON.parse(text) as Row[];
}

export function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

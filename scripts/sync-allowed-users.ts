/**
 * Syncs public.users with the CRM_ALLOWED_USERS environment variable.
 *
 *   CRM_ALLOWED_USERS="name@domain:admin,other@domain:operatore"
 *
 * - Listed emails are inserted, or updated with their role and reactivated.
 * - Users no longer listed are deactivated, never deleted.
 * - A listed user who already signed in is linked to their auth.users id.
 *
 * Connects with SUPABASE_DB_URL through the Supabase CLI (`supabase db query`).
 * Prints counts only: emails never appear in the output, not even in errors.
 *
 * Run with `npm run users:sync` after the migrations are applied.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ALLOWED_DOMAIN = "@parkingcloud.eu";
const ROLES = ["admin", "operatore"] as const;
type Role = (typeof ROLES)[number];

type AllowedUser = { email: string; role: Role };

type SyncCounts = {
  in_elenco: number;
  inseriti: number;
  aggiornati: number;
  disattivati: number;
  con_accesso_google: number;
};

class ConfigError extends Error {}

// Simple shape check; the database enforces the domain as well.
const EMAIL_PATTERN = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

function parseAllowedUsers(raw: string): AllowedUser[] {
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (entries.length === 0) {
    throw new ConfigError("CRM_ALLOWED_USERS è vuota.");
  }

  const seen = new Set<string>();
  return entries.map((entry, index) => {
    const position = `voce ${index + 1} di ${entries.length}`;
    const separator = entry.lastIndexOf(":");
    if (separator < 0) {
      throw new ConfigError(`${position}: formato atteso email:ruolo.`);
    }

    const email = entry.slice(0, separator).trim().toLowerCase();
    const role = entry.slice(separator + 1).trim().toLowerCase();

    if (!EMAIL_PATTERN.test(email)) {
      throw new ConfigError(`${position}: email non valida.`);
    }
    if (!email.endsWith(ALLOWED_DOMAIN)) {
      throw new ConfigError(`${position}: l'email deve essere ${ALLOWED_DOMAIN}.`);
    }
    if (!ROLES.includes(role as Role)) {
      throw new ConfigError(`${position}: ruolo non valido (ammessi: ${ROLES.join(", ")}).`);
    }
    if (seen.has(email)) {
      throw new ConfigError(`${position}: email ripetuta.`);
    }
    seen.add(email);

    return { email, role: role as Role };
  });
}

// Values are validated by parseAllowedUsers (no quotes possible), and quoted
// defensively anyway.
function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildSyncSql(users: AllowedUser[]): string {
  const values = users
    .map((user) => `(${sqlLiteral(user.email)}, ${sqlLiteral(user.role)}::public.user_role)`)
    .join(",\n    ");

  // One statement: every users row is touched by at most one of the CTEs.
  return `
with allowed (email, ruolo) as (
  values
    ${values}
),
auth_match as (
  select distinct on (lower(au.email)) lower(au.email) as email, au.id
  from auth.users au
  where lower(au.email) in (select email from allowed)
  order by lower(au.email), au.created_at desc
),
upserted as (
  insert into public.users as u (id, email, ruolo, attivo)
  select coalesce(m.id, gen_random_uuid()), a.email, a.ruolo, true
  from allowed a
  left join auth_match m on m.email = a.email
  on conflict (email) do update
    set ruolo = excluded.ruolo,
        attivo = true,
        id = case
          when exists (select 1 from auth_match m where m.id = excluded.id) then excluded.id
          else u.id
        end
    where u.ruolo is distinct from excluded.ruolo
       or not u.attivo
       or (u.id <> excluded.id and exists (select 1 from auth_match m where m.id = excluded.id))
  returning (xmax = 0) as inserted
),
deactivated as (
  update public.users u
  set attivo = false
  where u.attivo
    and u.email not in (select email from allowed)
  returning 1
)
select json_build_object(
  'in_elenco', (select count(*) from allowed),
  'inseriti', (select count(*) from upserted where inserted),
  'aggiornati', (select count(*) from upserted where not inserted),
  'disattivati', (select count(*) from deactivated),
  'con_accesso_google', (select count(*) from auth_match)
) as sync_counts;
`;
}

// Hides connection strings, passwords and email addresses in CLI messages.
function redact(message: string): string {
  return message
    .replace(/postgres(ql)?:\/\/\S+/gi, "<connessione>")
    .replace(/password=\S+/gi, "password=<nascosta>")
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "<email>")
    .trim();
}

function runQuery(dbUrl: string, sqlFile: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "npx",
      ["supabase", "db", "query", "--db-url", dbUrl, "--file", sqlFile, "--output-format", "json"],
      { maxBuffer: 1024 * 1024, shell: process.platform === "win32" },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`la query non è andata a buon fine. ${redact([stderr, stdout].filter(Boolean).join(" ") || error.message)}`));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function extractCounts(output: string): SyncCounts {
  const match = output.match(/\{[^{}]*"in_elenco"[^{}]*\}/);
  if (!match) {
    throw new Error("risposta del database non riconosciuta.");
  }
  return JSON.parse(match[0].replace(/\\"/g, '"')) as SyncCounts;
}

async function main(): Promise<void> {
  const rawList = process.env.CRM_ALLOWED_USERS;
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!rawList) throw new ConfigError("variabile CRM_ALLOWED_USERS mancante.");
  if (!dbUrl) throw new ConfigError("variabile SUPABASE_DB_URL mancante.");

  const users = parseAllowedUsers(rawList);

  // The SQL contains the emails: write it to a private temp file instead of
  // the command line, and delete it right after.
  const dir = mkdtempSync(join(tmpdir(), "crm-users-"));
  const sqlFile = join(dir, "sync.sql");
  try {
    writeFileSync(sqlFile, buildSyncSql(users), { mode: 0o600 });
    const counts = extractCounts(await runQuery(dbUrl, sqlFile));
    console.log("Sincronizzazione utenti completata.");
    console.log(`In elenco: ${counts.in_elenco}`);
    console.log(`Inseriti: ${counts.inseriti}`);
    console.log(`Aggiornati o riattivati: ${counts.aggiornati}`);
    console.log(`Disattivati: ${counts.disattivati}`);
    console.log(`Con accesso Google già collegato: ${counts.con_accesso_google}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "errore sconosciuto.";
  console.error(`Sincronizzazione non riuscita: ${message}`);
  process.exitCode = 1;
});

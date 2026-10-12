/**
 * Applies supabase/migrations through the Supabase Management API, for
 * environments where a direct Postgres connection is not available.
 *
 *   npm run db:migrate            dry run: lists the migrations to apply
 *   npm run db:migrate -- --apply applies them in order
 *
 * Each file runs in one request together with its row in
 * supabase_migrations.schema_migrations (the Supabase CLI history table), so a
 * migration and its registration succeed or fail together and `supabase db
 * push` stays aligned. Stops at the first error.
 *
 * Needs SUPABASE_ACCESS_TOKEN and NEXT_PUBLIC_SUPABASE_URL.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ScriptError, redact, runSql, sqlLiteral } from "./supabase-api";

const MIGRATIONS_DIR = join(__dirname, "..", "..", "supabase", "migrations");

// Same history table the Supabase CLI creates.
const HISTORY_TABLE_SQL = `
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text not null primary key);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;
`;

type Migration = { version: string; name: string; file: string };

function localMigrations(): Migration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort()
    .map((file) => {
      const [, version, name] = file.match(/^(\d+)_(.+)\.sql$/)!;
      return { version, name, file };
    });
}

async function appliedVersions(): Promise<Set<string>> {
  const [history] = await runSql<{ present: boolean }>(
    "select to_regclass('supabase_migrations.schema_migrations') is not null as present",
  );
  // No history table yet: nothing was ever applied with the CLI.
  if (!history?.present) return new Set();

  const rows = await runSql<{ version: string }>(
    "select version from supabase_migrations.schema_migrations",
  );
  return new Set(rows.map((row) => row.version));
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const applied = await appliedVersions();
  const pending = localMigrations().filter((migration) => !applied.has(migration.version));

  console.log(`Migrazioni già registrate: ${applied.size}`);
  if (pending.length === 0) {
    console.log("Nessuna migrazione da applicare.");
    return;
  }

  console.log(`Migrazioni da applicare (${pending.length}):`);
  pending.forEach((migration) => console.log(`  ${migration.file}`));

  if (!apply) {
    console.log("Dry run: niente è stato applicato. Per applicare: npm run db:migrate -- --apply");
    return;
  }

  await runSql(HISTORY_TABLE_SQL);

  for (const migration of pending) {
    const sql = readFileSync(join(MIGRATIONS_DIR, migration.file), "utf8");
    const register = `
insert into supabase_migrations.schema_migrations (version, name, statements)
values (${sqlLiteral(migration.version)}, ${sqlLiteral(migration.name)}, array[${sqlLiteral(sql)}]);`;
    try {
      await runSql(`${sql}\n;\n${register}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "errore sconosciuto.";
      throw new ScriptError(`${migration.file} non applicata (nessuna modifica fatta da questo file). ${message}`);
    }
    console.log(`Applicata: ${migration.file}`);
  }
  console.log(`Fatto: ${pending.length} migrazioni applicate.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? redact(error.message) : "errore sconosciuto.";
  console.error(`Migrazioni interrotte: ${message}`);
  process.exitCode = 1;
});

/**
 * Runs the SQL tests in supabase/tests through the Supabase Management API
 * and prints one line per test.
 *
 *   npm run db:test                      every file, in name order
 *   npm run db:test -- parking.sql       only the files named
 *
 * Each file opens a transaction and ends with ROLLBACK; psql meta-commands
 * (lines starting with a backslash) are dropped. The API returns the last
 * result set, which is the test report. A second query then checks that no
 * test data was left behind.
 *
 * Needs SUPABASE_ACCESS_TOKEN and NEXT_PUBLIC_SUPABASE_URL.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ScriptError, redact, runSql } from "./supabase-api";

const TESTS_DIR = join(__dirname, "..", "..", "supabase", "tests");

// Rows the tests create; all must be gone after the rollback.
const LEFTOVERS_SQL = `
select
  (select count(*) from auth.users where lower(email) like '%@example.com')
  + (select count(*) from public.users where email like '%@example.com')
  + (select count(*) from public.parties where denominazione like '%Esempio%')
  + (select count(*) from public.parking_facilities where nome like '%Esempio%')
  + (select count(*) from public.parking_products where nome like '%Esempio%' or note like '%di prova%')
  + (select count(*) from public.suppression_list where valore_normalizzato like '%@example.com')
  + (select count(*) from public.audit_logs where dopo::text like '%Esempio%' or prima::text like '%Esempio%')
    as residui,
  exists (select 1 from pg_constraint where conname = 'users_email_domain') as vincolo_dominio_presente;
`;

async function runFile(file: string): Promise<boolean> {
  const sql = readFileSync(join(TESTS_DIR, file), "utf8")
    .split("\n")
    .filter((line) => !line.startsWith("\\"))
    .join("\n");

  console.log(`== ${file}`);
  const rows = await runSql<{ esito: string }>(sql);
  if (rows.length === 0 || !rows.every((row) => typeof row.esito === "string")) {
    throw new ScriptError(`${file}: risposta dei test non riconosciuta.`);
  }
  rows.forEach((row) => console.log(row.esito));
  return !rows.some((row) => row.esito.startsWith("FAIL"));
}

async function main(): Promise<void> {
  const requested = process.argv.slice(2).filter((arg) => arg.endsWith(".sql"));
  const files = requested.length > 0 ? requested : readdirSync(TESTS_DIR).filter((file) => file.endsWith(".sql")).sort();

  let passed = true;
  for (const file of files) {
    passed = (await runFile(file)) && passed;
  }

  const [check] = await runSql<{ residui: number; vincolo_dominio_presente: boolean }>(LEFTOVERS_SQL);
  console.log(
    `Residui dopo il ROLLBACK: ${check.residui}; vincolo sul dominio di users presente: ${check.vincolo_dominio_presente ? "sì" : "no"}`,
  );

  if (!passed || Number(check.residui) !== 0 || !check.vincolo_dominio_presente) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? redact(error.message) : "errore sconosciuto.";
  console.error(`Test non eseguiti: ${message}`);
  process.exitCode = 1;
});

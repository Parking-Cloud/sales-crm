-- Application settings (app_settings) and the maximum radius of the car parks
-- shown for a location.
--
-- Run with all migrations applied, as the database owner:
--   npm run db:test   (Supabase Management API)
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/settings.sql
--
-- One transaction ending with ROLLBACK; only invented data ("Azienda Esempio
-- Srl", @example.com). The users email domain constraint is dropped inside
-- the transaction and comes back with the rollback.
-- Output: one line per test, then the summary (the last result set).

\set ON_ERROR_STOP 1
\set QUIET on
\pset tuples_only on
\pset format unaligned

begin;

-- ---------------------------------------------------------------------------
-- Harness
-- ---------------------------------------------------------------------------

create temp table test_results (n serial primary key, name text not null, ok boolean not null, detail text);
grant all on test_results to anon, authenticated;
grant all on sequence test_results_n_seq to anon, authenticated;

create temp table test_ids (key text primary key, id uuid not null);
grant select, insert on test_ids to anon, authenticated;

create function pg_temp.id(k text) returns uuid language sql stable as $$
  select id from test_ids where key = k
$$;

create function pg_temp.record(name text, ok boolean, detail text default null)
returns void language sql as $$
  insert into test_results (name, ok, detail) values (name, ok, detail)
$$;

create function pg_temp.expect_error(name text, stmt text, expected_state text default null)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    perform pg_temp.record(name, expected_state is null or sqlstate = expected_state, 'errore ' || sqlstate || ': ' || sqlerrm);
    return;
  end;
  perform pg_temp.record(name, false, 'nessun errore');
end;
$$;

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

alter table public.users drop constraint users_email_domain;

insert into public.users (email, nome, ruolo, attivo) values
  ('test-admin@example.com', 'Admin Di Prova', 'admin', true),
  ('test-operatore@example.com', 'Operatore Di Prova', 'operatore', true);
insert into auth.users (id, email) values
  (gen_random_uuid(), 'test-admin@example.com'),
  (gen_random_uuid(), 'test-operatore@example.com');
insert into test_ids (key, id)
select replace(split_part(email, '@', 1), 'test-', ''), id
from auth.users where email in ('test-admin@example.com', 'test-operatore@example.com');

-- Car parks north of the location: 0.009 degrees (about 1 km) and 0.09
-- degrees (about 10 km).
insert into public.parking_facilities (nome, tipo, lat, lng) values
  ('Parcheggio Esempio Vicino', 'autorimessa', 44.909, 8.9),
  ('Parcheggio Esempio Lontano', 'autorimessa', 44.99, 8.9);
insert into test_ids select 'park_1km', id from public.parking_facilities where nome = 'Parcheggio Esempio Vicino';
insert into test_ids select 'park_10km', id from public.parking_facilities where nome = 'Parcheggio Esempio Lontano';

select pg_temp.act_as(pg_temp.id('operatore'));

do $$
declare
  new_id uuid;
begin
  insert into public.parties (tipo, denominazione) values ('azienda', 'Azienda Esempio Distanze Srl')
  returning id into new_id;
  insert into test_ids values ('party', new_id);
  insert into public.party_locations (party_id, indirizzo, citta, principale, lat, lng)
  values (new_id, 'Via Esempio 1', 'Città Esempio', true, 44.9, 8.9);
exception when others then
  perform pg_temp.record('operatore: crea un soggetto con sede', false, sqlstate || ': ' || sqlerrm);
end;
$$;

-- Test car parks only, nearest first, as "nome=metri".
create function pg_temp.near(p_max_m integer default null) returns text language sql as $$
  select coalesce(string_agg(d.parcheggio || '=' || d.distanza_m, ', ' order by d.distanza_m), '')
  from public.party_location_distances(pg_temp.id('party'), p_max_m) d
  where d.parking_id in (pg_temp.id('park_1km'), pg_temp.id('park_10km'))
$$;

-- ---------------------------------------------------------------------------
-- Default and operator
-- ---------------------------------------------------------------------------

select pg_temp.record(
  'impostazione: distanza massima di default 5.000 m, letta dall''operatore',
  (select valore from public.app_settings where chiave = 'distanza_massima_parcheggi_m') = '5000'::jsonb
);

select pg_temp.record(
  'raggio 5 km (default): parcheggio a 1 km mostrato, a 10 km nascosto',
  pg_temp.near() ~ '^Parcheggio Esempio Vicino=(99\d|100\d)$',
  pg_temp.near()
);

select pg_temp.record(
  'raggio 20 km (parametro): entrambi, dal più vicino',
  pg_temp.near(20000) ~ '^Parcheggio Esempio Vicino=\d+, Parcheggio Esempio Lontano=(99\d\d|100\d\d)$',
  pg_temp.near(20000)
);

select pg_temp.record(
  'raggio 500 m: nessun parcheggio',
  pg_temp.near(500) = '',
  pg_temp.near(500)
);

with changed as (
  update public.app_settings set valore = '20000'::jsonb where chiave = 'distanza_massima_parcheggi_m' returning 1
)
select pg_temp.record('operatore: non modifica l''impostazione (nessuna riga aggiornata)', (select count(*) from changed) = 0);

select pg_temp.record(
  'operatore: dopo il tentativo il valore resta 5.000 m',
  (select valore from public.app_settings where chiave = 'distanza_massima_parcheggi_m') = '5000'::jsonb
);

select pg_temp.expect_error(
  'operatore: non crea impostazioni',
  $$insert into public.app_settings (chiave, valore) values ('impostazione_esempio', '1'::jsonb)$$,
  '42501'
);

with removed as (
  delete from public.app_settings where chiave = 'distanza_massima_parcheggi_m' returning 1
)
select pg_temp.record('operatore: non cancella l''impostazione', (select count(*) from removed) = 0);

reset role;

-- ---------------------------------------------------------------------------
-- Administrator
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('admin'));

select pg_temp.expect_error(
  'admin: 400 m rifiutato (minimo 500 m)',
  $$update public.app_settings set valore = '400'::jsonb where chiave = 'distanza_massima_parcheggi_m'$$,
  '23514'
);
select pg_temp.expect_error(
  'admin: 25.000 m rifiutato (massimo 20 km)',
  $$update public.app_settings set valore = '25000'::jsonb where chiave = 'distanza_massima_parcheggi_m'$$,
  '23514'
);
select pg_temp.expect_error(
  'admin: valore non intero rifiutato',
  $$update public.app_settings set valore = '1500.5'::jsonb where chiave = 'distanza_massima_parcheggi_m'$$,
  '23514'
);
select pg_temp.expect_error(
  'admin: testo rifiutato',
  $$update public.app_settings set valore = '"5 km"'::jsonb where chiave = 'distanza_massima_parcheggi_m'$$,
  '23514'
);

with changed as (
  update public.app_settings set valore = '20000'::jsonb where chiave = 'distanza_massima_parcheggi_m' returning updated_by
)
select pg_temp.record(
  'admin: imposta 20 km, autore della modifica registrato',
  (select count(*) from changed) = 1 and (select updated_by from changed) = pg_temp.id('admin')
);

reset role;
select pg_temp.act_as(pg_temp.id('operatore'));

select pg_temp.record(
  'raggio 20 km (impostazione): parcheggio a 10 km ora mostrato',
  pg_temp.near() ~ ', Parcheggio Esempio Lontano=',
  pg_temp.near()
);

reset role;

select pg_temp.record(
  'audit: modifica dell''admin registrata con valore prima e dopo',
  exists (
    select 1 from public.audit_logs
    where entita = 'app_settings' and azione = 'update' and utente_id = pg_temp.id('admin')
      and prima ->> 'valore' = '5000' and dopo ->> 'valore' = '20000'
  )
);

-- ---------------------------------------------------------------------------
-- Report: one result set (the last one), also returned by the Management API.
-- ---------------------------------------------------------------------------

select esito from (
  select n, case when ok then 'PASS' else 'FAIL' end || '  ' || name || coalesce('  (' || detail || ')', '') as esito
  from test_results
  union all
  select 1000000, (count(*) filter (where ok)) || '/' || count(*) || ' test superati' from test_results
) report
order by n;

rollback;

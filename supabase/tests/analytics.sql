-- Block 1a-10: Analytics events by period, from the date of each change in
-- the audit, with the car park, city and owner filters.
-- Changes made without a user (migrations) are not counted; no data means
-- zero rows.
--
-- Run with all migrations applied, as the database owner:
--   npm run db:test   (Supabase Management API)
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/analytics.sql
--
-- One transaction ending with ROLLBACK; only invented data ("Azienda Esempio
-- Srl", "Città Finta Alfa"). The users email domain constraint is dropped
-- inside the transaction and comes back with the rollback.
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

create temp table test_json (key text primary key, value jsonb);
grant all on test_json to anon, authenticated;
create function pg_temp.j(k text) returns jsonb language sql stable as $$ select value from test_json where key = k $$;

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
select replace(split_part(email, '@', 1), 'test-', ''), id from auth.users where email like 'test-%@example.com';

insert into public.parking_facilities (id, nome, nome_breve, tipo, citta) values
  ('00000000-0000-4000-8000-0000000000a1', 'Parcheggio Esempio Analytics Uno', 'Analytics Uno', 'autorimessa', 'Città Finta Alfa'),
  ('00000000-0000-4000-8000-0000000000a2', 'Parcheggio Esempio Analytics Due', 'Analytics Due', 'autorimessa', 'Città Finta Beta');

do $$
declare v uuid; k text;
begin
  foreach k in array array['x1', 'x2', 'x3', 'x4'] loop
    insert into public.parties (tipo, denominazione) values ('azienda', 'Azienda Esempio Analytics ' || upper(k) || ' Srl') returning id into v;
    insert into test_ids values (k, v);
  end loop;
end $$;

-- x1 on both car parks (owner: operatore on Uno, admin on Due); x2 on Uno;
-- x3 on Due; x4 without car parks.
with x as (insert into public.opportunities (party_id, parking_id, responsabile_id) values
  (pg_temp.id('x1'), '00000000-0000-4000-8000-0000000000a1', pg_temp.id('operatore')) returning id) insert into test_ids select 'o1a', id from x;
with x as (insert into public.opportunities (party_id, parking_id, responsabile_id) values
  (pg_temp.id('x1'), '00000000-0000-4000-8000-0000000000a2', pg_temp.id('admin')) returning id) insert into test_ids select 'o1b', id from x;
with x as (insert into public.opportunities (party_id, parking_id, responsabile_id) values
  (pg_temp.id('x2'), '00000000-0000-4000-8000-0000000000a1', pg_temp.id('operatore')) returning id) insert into test_ids select 'o2a', id from x;
with x as (insert into public.opportunities (party_id, parking_id, responsabile_id) values
  (pg_temp.id('x3'), '00000000-0000-4000-8000-0000000000a2', pg_temp.id('admin')) returning id) insert into test_ids select 'o3b', id from x;

update public.parties set ultimo_contatto_il = '2026-09-10' where id = pg_temp.id('x1');
update public.parties set ultimo_contatto_il = '2026-10-03' where id = pg_temp.id('x2');
update public.parties set ultimo_contatto_il = '2026-10-04' where id = pg_temp.id('x4');

-- Changes in the audit on known dates (written here as the database owner).
create function pg_temp.audit(entita text, id uuid, quando timestamptz, campo text, prima text, dopo text, utente uuid)
returns void language sql as $$
  insert into public.audit_logs (utente_id, entita, entita_id, azione, prima, dopo, quando)
  values (utente, entita, id, (case when prima is null then 'insert' else 'update' end)::public.audit_action,
          case when prima is null then null else jsonb_build_object(campo, prima) end, jsonb_build_object(campo, dopo), quando)
$$;
select pg_temp.audit('parties', pg_temp.id('x1'), '2026-09-29 09:00+02', 'stato_prospect', 'da_contattare', 'interessato', pg_temp.id('operatore'));
select pg_temp.audit('parties', pg_temp.id('x2'), '2026-10-02 09:00+02', 'stato_prospect', 'da_contattare', 'molto_interessato', pg_temp.id('operatore'));
-- Interessato -> Molto interessato: not a new interest.
select pg_temp.audit('parties', pg_temp.id('x2'), '2026-10-06 09:00+02', 'stato_prospect', 'interessato', 'molto_interessato', pg_temp.id('operatore'));
-- A change without a user (data migration): not an event.
select pg_temp.audit('parties', pg_temp.id('x3'), '2026-10-07 09:00+02', 'stato_prospect', 'da_contattare', 'interessato', null);
select pg_temp.audit('opportunities', pg_temp.id('o1a'), '2026-10-01 10:00+02', 'stato_offerta', 'da_inviare', 'inviata', pg_temp.id('operatore'));
select pg_temp.audit('opportunities', pg_temp.id('o1b'), '2026-10-02 10:00+02', 'stato_offerta', 'da_inviare', 'inviata', pg_temp.id('admin'));
select pg_temp.audit('opportunities', pg_temp.id('o2a'), '2026-10-05 10:00+02', 'stato_offerta', 'da_inviare', 'inviata', pg_temp.id('operatore'));
select pg_temp.audit('opportunities', pg_temp.id('o1a'), '2026-10-12 10:00+02', 'stato_offerta', 'inviata', 'accettata', pg_temp.id('operatore'));
select pg_temp.audit('opportunities', pg_temp.id('o2a'), '2026-10-20 10:00+02', 'stato_offerta', 'inviata', 'rifiutata', pg_temp.id('operatore'));
-- A deleted prospect (only its audit is left) and one merged into x4.
insert into test_ids values ('x0', gen_random_uuid());
select pg_temp.audit('parties', pg_temp.id('x0'), '2026-10-09 09:00+02', 'stato_prospect', 'da_contattare', 'interessato', pg_temp.id('operatore'));
with x as (insert into public.parties (tipo, denominazione, merged_into_id) values ('azienda', 'Azienda Esempio Analytics Doppia Srl', pg_temp.id('x4')) returning id)
insert into test_ids select 'x5', id from x;
select pg_temp.audit('parties', pg_temp.id('x5'), '2026-10-10 09:00+02', 'stato_prospect', 'da_contattare', 'interessato', pg_temp.id('operatore'));
-- x3's row on Due created directly as sent (insert, no "prima").
select pg_temp.audit('opportunities', pg_temp.id('o3b'), '2026-10-08 10:00+02', 'stato_offerta', null, 'inviata', pg_temp.id('admin'));
-- 31 October 23:30 UTC is 1 November in Rome: outside October.
select pg_temp.audit('opportunities', pg_temp.id('o1b'), '2026-10-31 23:30+00', 'stato_offerta', 'inviata', 'accettata', pg_temp.id('admin'));

create temp table fixture_parties as select id from test_ids where key like 'x_';
grant select on fixture_parties to authenticated;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));
create temp table ottobre as
select * from public.analytics_events('2026-10-01', '2026-10-31') where party_id in (select id from fixture_parties);
grant select on ottobre to authenticated;

select pg_temp.record(
  'periodo ottobre: conteggi dalla data del cambio di stato (audit), non dallo stato attuale',
  (select count(distinct party_id) from ottobre where tipo = 'contattato') = 2
  and (select count(distinct party_id) from ottobre where tipo = 'interessato') = 2
  and (select count(distinct opportunity_id) from ottobre where tipo = 'inviata') = 4
  and (select count(distinct opportunity_id) from ottobre where tipo = 'accettata') = 1
  and (select count(distinct opportunity_id) from ottobre where tipo = 'rifiutata') = 1,
  (select string_agg(tipo || ':' || giorno, ', ' order by giorno, tipo) from ottobre)
);
select pg_temp.record(
  'cambi senza utente (migrazioni) e Interessato -> Molto interessato non contano',
  not exists (select 1 from ottobre where tipo = 'interessato' and party_id = pg_temp.id('x3'))
  and (select count(*) from ottobre where tipo = 'interessato' and party_id = pg_temp.id('x2')) = 1
);
select pg_temp.record(
  'giorno di Roma: 31/10 alle 23:30 UTC è già novembre',
  (select count(*) from public.analytics_events('2026-11-01', '2026-11-30') where tipo = 'accettata' and opportunity_id = pg_temp.id('o1b')) = 1
  and not exists (select 1 from ottobre where tipo = 'accettata' and opportunity_id = pg_temp.id('o1b'))
);
select pg_temp.record(
  'settembre: interessato del 29/09 e contatto del 10/09; prospect senza parcheggi contati senza filtri',
  (select count(*) from public.analytics_events('2026-09-01', '2026-09-30') e where e.party_id = pg_temp.id('x1') and e.tipo = 'interessato') = 2
  and (select count(*) from ottobre where tipo = 'contattato' and party_id = pg_temp.id('x4') and parking_id is null) = 1,
  'x1 ha due parcheggi: una riga per parcheggio'
);
select pg_temp.record(
  'filtro parcheggio: solo le coppie di quel parcheggio; il prospect senza parcheggi esce',
  (select count(distinct opportunity_id) from public.analytics_events('2026-10-01', '2026-10-31', '00000000-0000-4000-8000-0000000000a1') where tipo = 'inviata') = 2
  and not exists (select 1 from public.analytics_events('2026-10-01', '2026-10-31', '00000000-0000-4000-8000-0000000000a1') where party_id = pg_temp.id('x4'))
);
select pg_temp.record(
  'filtro città del parcheggio (senza distinzione di maiuscole) e responsabile',
  (select count(distinct opportunity_id) from public.analytics_events('2026-10-01', '2026-10-31', null, 'città finta beta')
       where tipo = 'inviata' and party_id in (select id from fixture_parties)) = 2
  and (select count(distinct opportunity_id) from public.analytics_events('2026-10-01', '2026-10-31', null, null, pg_temp.id('admin'))
       where tipo = 'inviata' and party_id in (select id from fixture_parties)) = 2
  and (select count(distinct opportunity_id) from public.analytics_events('2026-10-01', '2026-10-31', null, null, pg_temp.id('operatore'))
       where tipo in ('accettata', 'rifiutata') and party_id in (select id from fixture_parties)) = 2
);
select pg_temp.record(
  'riga creata direttamente come Inviata: conta il giorno della creazione',
  exists (select 1 from ottobre where tipo = 'inviata' and opportunity_id = pg_temp.id('o3b') and giorno = '2026-10-08')
);
select pg_temp.record(
  'prospect eliminato: nessun evento; prospect unito: conta per quello in cui è stato unito',
  not exists (select 1 from ottobre where party_id = pg_temp.id('x0'))
  and exists (select 1 from ottobre where tipo = 'interessato' and party_id = pg_temp.id('x4') and giorno = '2026-10-10' and parking_id is null)
  and not exists (select 1 from ottobre where party_id = pg_temp.id('x5'))
);
select pg_temp.record(
  'periodo senza dati: nessun evento (zero)',
  not exists (select 1 from public.analytics_events('2026-06-01', '2026-06-30') where party_id in (select id from fixture_parties))
);
reset role;
select pg_temp.record(
  'utente anonimo: nessun evento (RLS)',
  (select count(*) from (select set_config('role', 'anon', true)) r, public.analytics_events('2026-10-01', '2026-10-31')) = 0
);
reset role;

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------

select esito from (
  select n, case when ok then 'PASS' else 'FAIL' end || '  ' || name || coalesce('  (' || detail || ')', '') as esito
  from test_results
  union all
  select 1000000, (count(*) filter (where ok)) || '/' || count(*) || ' test superati' from test_results
) report
order by n;

rollback;

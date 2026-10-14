-- Block 1a-5: user name from Google, API usage and limits, map search
-- results status, selective import and the 30-day rule for Google coordinates.
--
-- Run with all migrations applied, as the database owner:
--   npm run db:test   (Supabase Management API)
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/places.sql
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
  ('test-operatore@example.com', 'Operatore Di Prova', 'operatore', true),
  ('test-senza-nome@example.com', null, 'operatore', true),
  ('test-con-nome@example.com', 'Nome Scelto Nel Crm', 'operatore', true);
insert into auth.users (id, email, raw_user_meta_data) values
  (gen_random_uuid(), 'test-admin@example.com', null),
  (gen_random_uuid(), 'test-operatore@example.com', null),
  (gen_random_uuid(), 'test-senza-nome@example.com', '{"full_name": "Giulia Esempio", "name": "Giulia"}'),
  (gen_random_uuid(), 'test-con-nome@example.com', '{"full_name": "Altro Nome Google"}');
insert into test_ids (key, id)
select replace(split_part(email, '@', 1), 'test-', ''), id
from auth.users where email like 'test-%@example.com';

-- Car park of the search, and an existing party found again by Google.
insert into public.parking_facilities (id, nome, tipo, lat, lng) values
  ('00000000-0000-4000-8000-0000000000e1', 'Parcheggio Esempio Ricerca', 'autorimessa', 45.4642, 9.19);

select pg_temp.act_as(pg_temp.id('operatore'));
do $$
declare v uuid;
begin
  insert into public.parties (tipo, denominazione, telefono) values ('azienda', 'Studio Esempio Associati', '02 1111 2222') returning id into v;
  insert into test_ids values ('esistente', v);
  insert into public.party_locations (party_id, indirizzo, cap, citta, principale) values (v, 'Via Esempio 1', '20121', 'Milano', true);
  insert into public.external_references (entita, entita_id, sistema, id_esterno) values ('parties', v, 'google_places', 'finto-place-esistente');
  insert into public.parties (tipo, denominazione, non_contattare) values ('azienda', 'Bar Esempio Escluso', true) returning id into v;
  insert into test_ids values ('escluso', v);
  insert into public.party_locations (party_id, indirizzo, cap, citta, principale) values (v, 'Via Prova 2', '20121', 'Milano', true);
end $$;
reset role;
insert into public.suppression_list (tipo, valore_normalizzato, motivo) values ('dominio', 'escluso-esempio.example', 'Test');

-- ---------------------------------------------------------------------------
-- User name from the Google profile
-- ---------------------------------------------------------------------------

select pg_temp.record(
  'nome utente: al primo accesso preso dal profilo Google (full_name)',
  (select nome from public.users where email = 'test-senza-nome@example.com') = 'Giulia Esempio'
);
select pg_temp.record(
  'nome utente: un nome già scritto nel CRM non viene sovrascritto',
  (select nome from public.users where email = 'test-con-nome@example.com') = 'Nome Scelto Nel Crm'
);
update public.users set nome = '' where email = 'test-senza-nome@example.com';
update auth.users set raw_user_meta_data = '{"name": "Giulia Esempio Bis"}', last_sign_in_at = now()
where email = 'test-senza-nome@example.com';
select pg_temp.record(
  'nome utente: a un accesso successivo con nome vuoto viene preso da name',
  (select nome from public.users where email = 'test-senza-nome@example.com') = 'Giulia Esempio Bis'
);

-- ---------------------------------------------------------------------------
-- API usage and daily limits
-- ---------------------------------------------------------------------------

-- The limit is set 3 calls above today's real use on the database.
insert into test_json select 'usate_prima', to_jsonb(coalesce((
  select chiamate from public.api_usage where giorno = (now() at time zone 'Europe/Rome')::date and sku = 'nearby_search_pro'), 0));
update public.app_settings set valore = to_jsonb(pg_temp.j('usate_prima')::text::int + 3) where chiave = 'limite_giornaliero_nearby';
select pg_temp.act_as(pg_temp.id('operatore'));
insert into test_json select 'q1', public.use_api_quota('nearby_search_pro', 2);
insert into test_json select 'q2', public.use_api_quota('nearby_search_pro', 2);
insert into test_json select 'q3', public.use_api_quota('nearby_search_pro', 1);
insert into test_json select 'q4', public.use_api_quota('route_matrix_essentials', 25);
reset role;

select pg_temp.record(
  'limiti: entro il limite le chiamate sono contate, oltre il limite rifiutate e non contate',
  (pg_temp.j('q1') ->> 'ok')::boolean and not (pg_temp.j('q2') ->> 'ok')::boolean and (pg_temp.j('q3') ->> 'ok')::boolean
  and (pg_temp.j('q3') ->> 'usate')::int = pg_temp.j('usate_prima')::text::int + 3
  and (select chiamate from public.api_usage where giorno = (now() at time zone 'Europe/Rome')::date and sku = 'nearby_search_pro')
      = pg_temp.j('usate_prima')::text::int + 3,
  concat_ws(' | ', pg_temp.j('q1'), pg_temp.j('q2'), pg_temp.j('q3'))
);
select pg_temp.record(
  'limiti: Route Matrix contato per elementi, senza limite',
  (pg_temp.j('q4') ->> 'ok')::boolean and pg_temp.j('q4') -> 'limite' = 'null'::jsonb
);
select pg_temp.act_as(pg_temp.id('operatore'));
select pg_temp.expect_error(
  'api_usage: l''operatore non scrive direttamente i contatori',
  $$insert into public.api_usage (giorno, sku, chiamate) values (current_date + 1, 'nearby_search_pro', 0)$$,
  '42501'
);
with changed as (
  update public.app_settings set valore = '1000'::jsonb where chiave = 'limite_giornaliero_nearby' returning 1
)
select pg_temp.record('limiti: l''operatore non cambia il limite giornaliero', (select count(*) from changed) = 0);
reset role;
select pg_temp.act_as(pg_temp.id('admin'));
select pg_temp.expect_error(
  'limiti: valore non valido rifiutato',
  $$update public.app_settings set valore = '-5'::jsonb where chiave = 'limite_giornaliero_details'$$,
  '23514'
);
reset role;

-- ---------------------------------------------------------------------------
-- Search results status
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));
insert into test_json
select 'stati', jsonb_object_agg(c.place_id, jsonb_build_object('stato', c.stato, 'party_id', c.party_id))
from public.check_places('[
  {"place_id": "finto-place-esistente", "nome": "Studio Associato Esempio", "cap": "20121", "citta": "Milano"},
  {"place_id": "finto-place-simile", "nome": "Studio Esempio Associati Srl", "cap": "20121", "citta": "Milano"},
  {"place_id": "finto-place-escluso", "nome": "Bar Esempio Escluso", "cap": "20121", "citta": "Milano"},
  {"place_id": "finto-place-nuovo", "nome": "Trattoria Inventata", "cap": "20121", "citta": "Milano"}
]'::jsonb) c;
reset role;

select pg_temp.record(
  'stati: stesso place_id e nome simile = Già nel CRM, non contattare = esclusione, altrimenti nuovo',
  pg_temp.j('stati') -> 'finto-place-esistente' ->> 'stato' = 'presente'
  and (pg_temp.j('stati') -> 'finto-place-esistente' ->> 'party_id')::uuid = pg_temp.id('esistente')
  and pg_temp.j('stati') -> 'finto-place-simile' ->> 'stato' = 'presente'
  and pg_temp.j('stati') -> 'finto-place-escluso' ->> 'stato' = 'esclusione'
  and pg_temp.j('stati') -> 'finto-place-nuovo' ->> 'stato' = 'nuovo',
  pg_temp.j('stati')::text
);

-- ---------------------------------------------------------------------------
-- Selective import
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));
insert into test_json
select 'imp', public.import_places('00000000-0000-4000-8000-0000000000e1', replace('[
  {"place_id": "finto-place-nuovo", "nome": "Trattoria Inventata", "categoria": "Ristoranti", "telefono": "02 3333 4444",
   "sito": "https://www.trattoria-inventata.example", "indirizzo": "Via Finta 3", "cap": "20121", "citta": "Milano", "lat": 45.4645, "lng": 9.1905},
  {"place_id": "finto-place-esistente", "nome": "Studio Associato Esempio", "categoria": "Studi professionali"},
  {"place_id": "finto-place-dominio", "nome": "Negozio Esempio", "sito": "https://escluso-esempio.example/", "cap": "20121", "citta": "Milano"},
  {"place_id": "finto-place-telefono", "nome": "Ufficio Diverso", "telefono": "+39 02 1111 2222", "cap": "20100", "citta": "Milano"},
  {"place_id": "finto-place-unisci", "nome": "Altro Ufficio", "telefono": "02 1111 2222", "scelta": "unisci", "unisci_a": "%ESISTENTE%"},
  {"place_id": "finto-place-crea", "nome": "Ufficio Ancora Diverso", "telefono": "0211112222", "scelta": "crea", "cap": "20100", "citta": "Milano"}
]', '%ESISTENTE%', pg_temp.id('esistente')::text)::jsonb);
reset role;

create function pg_temp.esito(p text) returns text language sql as $$
  select r ->> 'esito' from jsonb_array_elements(pg_temp.j('imp') -> 'righe') r where r ->> 'place_id' = p
$$;

select pg_temp.record(
  'import: nuovo creato, stesso place_id e lista di esclusione saltati, avviso senza scelta da decidere, unisci e crea comunque',
  pg_temp.esito('finto-place-nuovo') = 'creato'
  and pg_temp.esito('finto-place-esistente') = 'saltato'
  and pg_temp.esito('finto-place-dominio') = 'saltato'
  and pg_temp.esito('finto-place-telefono') = 'da_decidere'
  and pg_temp.esito('finto-place-unisci') = 'aggiunto'
  and pg_temp.esito('finto-place-crea') = 'creato'
  and (pg_temp.j('imp') ->> 'creati')::int = 2 and (pg_temp.j('imp') ->> 'aggiunti')::int = 1 and (pg_temp.j('imp') ->> 'saltati')::int = 3,
  pg_temp.j('imp')::text
);

select pg_temp.record(
  'import: soggetto azienda con categoria, telefono e sito; sede con coordinate Google datate',
  exists (
    select 1 from public.parties p join public.party_locations l on l.party_id = p.id
    where p.denominazione = 'Trattoria Inventata' and p.tipo = 'azienda' and p.categoria = 'Ristoranti'
      and p.telefono = '+390233334444' and p.dominio = 'trattoria-inventata.example'
      and l.principale and l.cap = '20121' and l.coordinate_fonte = 'google' and l.coordinate_aggiornate_il is not null
  )
);
select pg_temp.record(
  'import: place_id salvato (google_places), provenienza Google Places da verificare',
  exists (select 1 from public.external_references r join public.parties p on p.id = r.entita_id
          where r.sistema = 'google_places' and r.id_esterno = 'finto-place-nuovo' and p.denominazione = 'Trattoria Inventata')
  and (select count(*) from public.field_provenance f join public.data_sources s on s.id = f.fonte_id
       join public.parties p on p.id = f.entita_id
       where p.denominazione = 'Trattoria Inventata' and s.nome = 'Google Places' and f.stato = 'da_verificare') = 3
);
select pg_temp.record(
  'import: opportunità individuata sul parcheggio, assegnata a chi importa (anche sul soggetto esistente)',
  exists (select 1 from public.opportunities o join public.parties p on p.id = o.party_id
          where p.denominazione = 'Trattoria Inventata' and o.parking_id = '00000000-0000-4000-8000-0000000000e1'
            and o.fase = 'individuata' and o.esito = 'aperta' and o.responsabile_id = pg_temp.id('operatore'))
  and exists (select 1 from public.opportunities o where o.party_id = pg_temp.id('esistente')
              and o.parking_id = '00000000-0000-4000-8000-0000000000e1' and o.fase = 'individuata')
  and (select count(*) from public.parties where denominazione = 'Altro Ufficio') = 0
);
select pg_temp.expect_error(
  'import: più di 50 risultati rifiutati',
  $$select public.import_places('00000000-0000-4000-8000-0000000000e1',
      (select jsonb_agg(jsonb_build_object('place_id', 'x' || g, 'nome', 'Finto ' || g)) from generate_series(1, 51) g))$$,
  '22023'
);

-- ---------------------------------------------------------------------------
-- 30 days rule for Google coordinates
-- ---------------------------------------------------------------------------

-- The imported location becomes 26 days old, another one 40 days old.
update public.party_locations l set coordinate_aggiornate_il = now() - interval '26 days'
from public.parties p where p.id = l.party_id and p.denominazione = 'Trattoria Inventata';
update public.party_locations l set coordinate_aggiornate_il = now() - interval '40 days', lat = 45.4643, lng = 9.1901
from public.parties p where p.id = l.party_id and p.denominazione = 'Ufficio Ancora Diverso';
update public.party_locations l set coordinate_fonte = 'google'
from public.parties p where p.id = l.party_id and p.denominazione = 'Ufficio Ancora Diverso';

select pg_temp.record(
  '30 giorni: oltre 25 giorni le sedi Google sono da rileggere (con il place_id)',
  (select count(*) from public.google_locations_due(200) d where d.place_id in ('finto-place-nuovo', 'finto-place-crea')) = 2
);
select pg_temp.record(
  '30 giorni: coordinate Google oltre i 30 giorni non usate per le distanze, entro i 30 sì',
  (select count(*) from public.party_location_distances(
     (select id from public.parties where denominazione = 'Ufficio Ancora Diverso'), 20000)) = 0
  and (select count(*) from public.party_location_distances(
     (select id from public.parties where denominazione = 'Trattoria Inventata'), 20000)
     where parking_id = '00000000-0000-4000-8000-0000000000e1') = 1
);

-- Refresh with a FAKE Details answer: one place moved, one no longer found.
insert into test_json
select 'refresh', public.apply_google_coordinates(jsonb_build_array(
  jsonb_build_object('location_id', (select l.id from public.party_locations l join public.parties p on p.id = l.party_id where p.denominazione = 'Trattoria Inventata'),
                     'lat', 45.4650, 'lng', 9.1910),
  jsonb_build_object('location_id', (select l.id from public.party_locations l join public.parties p on p.id = l.party_id where p.denominazione = 'Ufficio Ancora Diverso'),
                     'lat', null, 'lng', null)
));
select pg_temp.record(
  '30 giorni: coordinate rilette aggiornate con la data di oggi, luogo sparito = coordinate cancellate',
  (pg_temp.j('refresh') ->> 'aggiornate')::int = 1 and (pg_temp.j('refresh') ->> 'cancellate')::int = 1
  and exists (select 1 from public.party_locations l join public.parties p on p.id = l.party_id
              where p.denominazione = 'Trattoria Inventata' and l.lat = 45.4650 and l.coordinate_aggiornate_il > now() - interval '1 minute')
  and exists (select 1 from public.party_locations l join public.parties p on p.id = l.party_id
              where p.denominazione = 'Ufficio Ancora Diverso' and l.lat is null and l.coordinate_fonte is null)
  and (select count(*) from public.google_locations_due(200) d where d.place_id in ('finto-place-nuovo', 'finto-place-crea')) = 0,
  pg_temp.j('refresh')::text
);

-- An operator confirms the address: Nominatim coordinates leave the Google cycle.
select pg_temp.act_as(pg_temp.id('operatore'));
update public.party_locations l set lat = 45.4651, lng = 9.1911, coordinate_fonte = 'nominatim', coordinate_aggiornate_il = now() - interval '90 days'
from public.parties p where p.id = l.party_id and p.denominazione = 'Trattoria Inventata';
reset role;
select pg_temp.record(
  '30 giorni: indirizzo confermato (Nominatim) fuori dal giro di Google, coordinate sempre usate',
  (select count(*) from public.google_locations_due(200, 0) d where d.place_id = 'finto-place-nuovo') = 0
  and (select count(*) from public.party_location_distances(
     (select id from public.parties where denominazione = 'Trattoria Inventata'), 20000)) >= 1
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

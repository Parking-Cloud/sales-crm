-- Block 1a-3: parties, normalization, duplicates, "do not contact", merge,
-- distances and search.
--
-- Run with all migrations applied, as the database owner:
--   npm run db:test   (Supabase Management API)
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/parties.sql
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

-- Duplicate check results as "livello:motivo" strings, for compact asserts.
create function pg_temp.dups(
  p_party_id uuid default null, p_denominazione text default null, p_piva text default null,
  p_place_id text default null, p_telefono text default null, p_email text default null,
  p_sito text default null, p_cap text default null, p_citta text default null
) returns text[] language sql as $$
  select coalesce(array_agg(d.livello || ':' || d.motivo || ':' || coalesce(d.party_id::text, '-') order by 1), '{}')
  from public.check_party_duplicates(
    p_party_id => p_party_id, p_denominazione => p_denominazione, p_piva => p_piva, p_place_id => p_place_id,
    p_telefono => p_telefono, p_email => p_email, p_sito => p_sito, p_cap => p_cap, p_citta => p_citta
  ) d
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

-- Car parks 0.01 degrees of latitude apart (about 1,113 m), one archived.
insert into public.parking_facilities (id, nome, tipo, lat, lng) values
  (gen_random_uuid(), 'Parcheggio Esempio Sud', 'autorimessa', 45.4642, 9.19),
  (gen_random_uuid(), 'Parcheggio Esempio Nord', 'autorimessa', 45.4742, 9.19);
insert into public.parking_facilities (id, nome, tipo, lat, lng, archived_at) values
  (gen_random_uuid(), 'Parcheggio Esempio Archiviato', 'autorimessa', 45.4643, 9.19, now());
insert into test_ids select 'park_sud', id from public.parking_facilities where nome = 'Parcheggio Esempio Sud';
insert into test_ids select 'park_nord', id from public.parking_facilities where nome = 'Parcheggio Esempio Nord';

-- ---------------------------------------------------------------------------
-- Operator: creation and normalization
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));

do $$
declare
  new_id uuid;
begin
  insert into public.parties (tipo, denominazione, categoria, piva, telefono, email, sito)
  values ('azienda', 'Azienda Esempio Srl', 'Uffici', 'IT 12345678901', '02 1234 5678', 'Info@Esempio-Uno.IT', 'https://www.Esempio-Uno.it/chi-siamo')
  returning id into new_id;
  insert into test_ids values ('a', new_id);
  insert into public.party_locations (party_id, indirizzo, cap, citta, principale, lat, lng)
  values (new_id, 'Via Esempio 1', '20100', 'Milano', true, 45.4642, 9.19);
exception when others then
  perform pg_temp.record('operatore: crea un soggetto con sede', false, sqlstate || ': ' || sqlerrm);
end;
$$;

select pg_temp.record(
  'normalizzazione: telefono +39, email minuscola, dominio senza www e percorso, P.IVA senza IT',
  telefono = '+390212345678' and email = 'info@esempio-uno.it' and dominio = 'esempio-uno.it' and piva = '12345678901',
  concat_ws(' | ', telefono, email, dominio, piva)
)
from public.parties where id = pg_temp.id('a');

select pg_temp.expect_error(
  'email segnaposto "Non disponibile": rifiutata',
  $$insert into public.parties (tipo, denominazione, email) values ('azienda', 'Altra Azienda Esempio', 'Non disponibile')$$,
  '23514'
);
select pg_temp.expect_error(
  'email segnaposto "Compilare form sul sito": rifiutata',
  $$insert into public.parties (tipo, denominazione, email) values ('azienda', 'Altra Azienda Esempio', 'Compilare form sul sito')$$,
  '23514'
);

do $$
declare
  new_id uuid;
begin
  insert into public.contacts (party_id, nome, cognome, ruolo, email, telefono)
  values (pg_temp.id('a'), 'Mario', 'Esempio', 'Responsabile', 'Mario.Esempio@Example.com', '347 1234567 // 02 7654321')
  returning id into new_id;
  insert into test_ids values ('contact_a', new_id);
end;
$$;

select pg_temp.record(
  'normalizzazione: più telefoni ammessi nei contatti',
  telefono = '+393471234567, +39027654321' and email = 'mario.esempio@example.com',
  telefono
)
from public.contacts where id = pg_temp.id('contact_a');

-- ---------------------------------------------------------------------------
-- Duplicate check
-- ---------------------------------------------------------------------------

select pg_temp.record(
  'doppioni: blocco per stessa P.IVA',
  pg_temp.dups(p_piva => 'IT12345678901') = array['blocco:Stessa partita IVA:' || pg_temp.id('a')],
  array_to_string(pg_temp.dups(p_piva => 'IT12345678901'), ', ')
);

reset role;
insert into public.external_references (entita, entita_id, sistema, id_esterno)
values ('parties', pg_temp.id('a'), 'google_places', 'place-esempio-1');
insert into public.suppression_list (tipo, valore_normalizzato, motivo)
values ('email', 'bloccato@example.com', 'Test');
select pg_temp.act_as(pg_temp.id('operatore'));

select pg_temp.record(
  'doppioni: blocco per stesso place_id',
  pg_temp.dups(p_place_id => 'place-esempio-1') = array['blocco:Stesso luogo Google (place_id):' || pg_temp.id('a')],
  array_to_string(pg_temp.dups(p_place_id => 'place-esempio-1'), ', ')
);
select pg_temp.record(
  'doppioni: blocco per valore nella lista di esclusione',
  pg_temp.dups(p_email => 'Bloccato@Example.com') = array['blocco:Nella lista di esclusione (email):-'],
  array_to_string(pg_temp.dups(p_email => 'Bloccato@Example.com'), ', ')
);
select pg_temp.record(
  'doppioni: avviso per stesso telefono (scritto in altro modo)',
  pg_temp.dups(p_telefono => '02-1234.5678') = array['avviso:Stesso telefono:' || pg_temp.id('a')],
  array_to_string(pg_temp.dups(p_telefono => '02-1234.5678'), ', ')
);
select pg_temp.record(
  'doppioni: avviso per telefono di un contatto',
  pg_temp.dups(p_telefono => '02 7654321') = array['avviso:Stesso telefono:' || pg_temp.id('a')],
  array_to_string(pg_temp.dups(p_telefono => '02 7654321'), ', ')
);
select pg_temp.record(
  'doppioni: avviso per stesso dominio',
  pg_temp.dups(p_sito => 'esempio-uno.it/contatti') = array['avviso:Stesso dominio del sito:' || pg_temp.id('a')],
  array_to_string(pg_temp.dups(p_sito => 'esempio-uno.it/contatti'), ', ')
);
select pg_temp.record(
  'doppioni: avviso per nome simile nello stesso CAP',
  pg_temp.dups(p_denominazione => 'Azienda Esempio S.r.l.', p_cap => '20100') = array['avviso:Nome simile nella stessa zona:' || pg_temp.id('a')],
  array_to_string(pg_temp.dups(p_denominazione => 'Azienda Esempio S.r.l.', p_cap => '20100'), ', ')
);
select pg_temp.record(
  'doppioni: avviso per nome simile nella stessa città',
  pg_temp.dups(p_denominazione => 'Azienda Esempio', p_citta => 'milano') = array['avviso:Nome simile nella stessa zona:' || pg_temp.id('a')],
  array_to_string(pg_temp.dups(p_denominazione => 'Azienda Esempio', p_citta => 'milano'), ', ')
);
select pg_temp.record(
  'doppioni: nessun avviso per nome simile in un''altra città',
  pg_temp.dups(p_denominazione => 'Azienda Esempio', p_citta => 'Roma') = '{}'::text[]
);

do $$
declare
  new_id uuid;
begin
  insert into public.parties (tipo, nome, cognome, email, sito)
  values ('persona', 'Luca', 'Esempio', 'luca.esempio@gmail.com', 'https://www.gmail.com/')
  returning id into new_id;
  insert into test_ids values ('gmail', new_id);
end;
$$;

select pg_temp.record(
  'doppioni: nessun avviso per domini di posta generici (gmail)',
  pg_temp.dups(p_sito => 'gmail.com', p_email => 'altra.persona@gmail.com') = '{}'::text[],
  array_to_string(pg_temp.dups(p_sito => 'gmail.com', p_email => 'altra.persona@gmail.com'), ', ')
);
select pg_temp.record(
  'doppioni: il soggetto non è doppione di sé stesso',
  pg_temp.dups(p_party_id => pg_temp.id('a'), p_piva => '12345678901', p_telefono => '0212345678') = '{}'::text[]
);

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------

select pg_temp.record(
  'ricerca: nome scritto in modo diverso ("Azenda Esempo") trova il soggetto',
  exists (select 1 from public.search_parties(p_query => 'Azenda Esempo') where id = pg_temp.id('a'))
);
select pg_temp.record(
  'ricerca: per P.IVA, telefono e dominio',
  exists (select 1 from public.search_parties(p_query => 'IT12345678901') where id = pg_temp.id('a'))
  and exists (select 1 from public.search_parties(p_query => '02 1234 5678') where id = pg_temp.id('a'))
  and exists (select 1 from public.search_parties(p_query => 'www.esempio-uno.it') where id = pg_temp.id('a'))
);
select pg_temp.record(
  'ricerca: filtri per tipo, categoria e città',
  (select count(*) from public.search_parties(p_tipo => 'azienda', p_categoria => 'Uffici', p_citta => 'Milano') where id = pg_temp.id('a')) = 1
  and (select count(*) from public.search_parties(p_tipo => 'persona') where id = pg_temp.id('a')) = 0
);

-- ---------------------------------------------------------------------------
-- Distances
-- ---------------------------------------------------------------------------

select pg_temp.record(
  'distanza: 0 m dal parcheggio nello stesso punto, circa 1.113 m da quello 0,01° a nord, archiviati esclusi',
  (select distanza_m from public.party_location_distances(pg_temp.id('a')) where parking_id = pg_temp.id('park_sud')) = 0
  and (select distanza_m from public.party_location_distances(pg_temp.id('a')) where parking_id = pg_temp.id('park_nord')) between 1110 and 1116
  and (select count(*) from public.party_location_distances(pg_temp.id('a')) where parcheggio like '%Archiviato%') = 0,
  (select string_agg(parcheggio || '=' || distanza_m, ', ') from public.party_location_distances(pg_temp.id('a')))
);

-- ---------------------------------------------------------------------------
-- Do not contact
-- ---------------------------------------------------------------------------

create temp table dnc_result (added integer);
grant all on dnc_result to authenticated;
insert into dnc_result select public.mark_do_not_contact('parties', pg_temp.id('a'), 'Ha chiesto di non essere contattato');

select pg_temp.record(
  'non contattare: l''operatore lo imposta e scrive in suppression_list con motivo e autore',
  (select added from dnc_result) = 6
  and (select non_contattare from public.parties where id = pg_temp.id('a'))
  and (select count(*) from public.suppression_list
       where valore_normalizzato in ('+390212345678', 'info@esempio-uno.it', 'esempio-uno.it', '+393471234567')
         and motivo = 'Ha chiesto di non essere contattato'
         and created_by = pg_temp.id('operatore')) = 4
);
select pg_temp.record(
  'non contattare: dopo l''impostazione il telefono blocca i nuovi doppioni',
  'blocco:Nella lista di esclusione (telefono):' || pg_temp.id('a') = any (pg_temp.dups(p_telefono => '0212345678'))
);
select pg_temp.expect_error(
  'non contattare: l''operatore non lo toglie con la funzione',
  format($$select public.clear_do_not_contact('parties', %L)$$, pg_temp.id('a')),
  '42501'
);
select pg_temp.expect_error(
  'non contattare: l''operatore non lo toglie con un update diretto',
  format('update public.parties set non_contattare = false where id = %L', pg_temp.id('a')),
  '42501'
);
select pg_temp.expect_error(
  'non contattare: il motivo è obbligatorio',
  format($$select public.mark_do_not_contact('contacts', %L, '  ')$$, pg_temp.id('contact_a')),
  '23514'
);

reset role;
select pg_temp.act_as(pg_temp.id('admin'));
delete from dnc_result;
insert into dnc_result select public.clear_do_not_contact('parties', pg_temp.id('a'));
select pg_temp.record(
  'non contattare: l''admin lo toglie e libera la lista di esclusione',
  (select added from dnc_result) = 6
  and not (select non_contattare from public.parties where id = pg_temp.id('a'))
  and not exists (select 1 from public.suppression_list where valore_normalizzato = '+390212345678')
);
reset role;

-- ---------------------------------------------------------------------------
-- Merge
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));
do $$
declare
  new_id uuid;
begin
  insert into public.parties (tipo, denominazione, telefono, sito)
  values ('azienda', 'Azienda Esempio S.r.l.', '06 1234567', 'https://esempio-due.it')
  returning id into new_id;
  insert into test_ids values ('d', new_id);
  insert into public.party_locations (party_id, indirizzo, cap, citta, principale)
  values (new_id, 'Via Esempio 2', '20100', 'Milano', true);
  insert into public.contacts (party_id, nome, email) values (new_id, 'Giulia', 'giulia.esempio@example.com');
end;
$$;
reset role;
insert into public.data_sources (nome) values ('Fonte Di Prova Esempio') on conflict do nothing;
insert into public.field_provenance (entita, entita_id, campo, fonte_id, stato)
select 'parties', pg_temp.id('d'), 'telefono', id, 'verificato' from public.data_sources where nome = 'Fonte Di Prova Esempio';
insert into public.field_provenance (entita, entita_id, campo, fonte_id, stato)
select 'parties', pg_temp.id('a'), 'telefono', id, 'da_verificare' from public.data_sources where nome = 'Fonte Di Prova Esempio';
insert into public.external_references (entita, entita_id, sistema, id_esterno)
values ('parties', pg_temp.id('d'), 'excel', 'riga-esempio-7');

select pg_temp.act_as(pg_temp.id('operatore'));
select pg_temp.expect_error(
  'unione: l''operatore non può unire',
  format('select public.merge_parties(%L, %L)', pg_temp.id('a'), pg_temp.id('d')),
  '42501'
);
reset role;

select pg_temp.act_as(pg_temp.id('admin'));
do $$
begin
  perform public.merge_parties(pg_temp.id('a'), pg_temp.id('d'), '{"telefono": "+39061234567", "id": "00000000-0000-0000-0000-000000000000"}'::jsonb);
  perform pg_temp.record('unione: l''admin unisce due soggetti', true);
exception when others then
  perform pg_temp.record('unione: l''admin unisce due soggetti', false, sqlstate || ': ' || sqlerrm);
end;
$$;
reset role;

select pg_temp.record(
  'unione: sedi, contatti e riferimenti esterni spostati; una sola sede principale',
  (select count(*) from public.party_locations where party_id = pg_temp.id('d')) = 0
  and (select count(*) from public.party_locations where party_id = pg_temp.id('a')) = 2
  and (select count(*) from public.party_locations where party_id = pg_temp.id('a') and principale) = 1
  and (select count(*) from public.contacts where party_id = pg_temp.id('d')) = 0
  and (select count(*) from public.contacts where party_id = pg_temp.id('a')) = 2
  and (select entita_id from public.external_references where id_esterno = 'riga-esempio-7') = pg_temp.id('a')
);
select pg_temp.record(
  'unione: valore scelto applicato, provenienza del valore scelto spostata',
  (select telefono from public.parties where id = pg_temp.id('a')) = '+39061234567'
  and (select count(*) from public.field_provenance where entita_id = pg_temp.id('d')) = 0
  and (select stato from public.field_provenance where entita_id = pg_temp.id('a') and campo = 'telefono') = 'verificato'
);
select pg_temp.record(
  'unione: merged_into_id valorizzato e soggetto nascosto dall''elenco',
  (select merged_into_id from public.parties where id = pg_temp.id('d')) = pg_temp.id('a')
  and not exists (select 1 from public.search_parties(p_query => 'Azienda Esempio') where id = pg_temp.id('d'))
);
select pg_temp.record(
  'unione: tracciata in audit_logs con l''autore',
  exists (
    select 1 from public.audit_logs
    where entita = 'parties' and entita_id = pg_temp.id('d') and azione = 'update'
      and utente_id = pg_temp.id('admin')
      and dopo ->> 'merged_into_id' = pg_temp.id('a')::text
  )
  and exists (
    select 1 from public.audit_logs
    where entita = 'parties' and entita_id = pg_temp.id('a') and azione = 'update'
      and utente_id = pg_temp.id('admin') and dopo ->> 'telefono' = '+39061234567'
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

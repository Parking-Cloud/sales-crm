-- Block 1a-6: party list by car park, notes, party deletion, pipeline rules,
-- activities and reminders, history of stage changes, permissions.
--
-- Run with all migrations applied, as the database owner:
--   npm run db:test   (Supabase Management API)
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/pipeline.sql
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
  ('test-collega@example.com', 'Collega Di Prova', 'operatore', true);
insert into auth.users (id, email) values
  (gen_random_uuid(), 'test-admin@example.com'),
  (gen_random_uuid(), 'test-operatore@example.com'),
  (gen_random_uuid(), 'test-collega@example.com');
insert into test_ids (key, id)
select replace(split_part(email, '@', 1), 'test-', ''), id from auth.users where email like 'test-%@example.com';

insert into public.parking_facilities (id, nome, nome_breve, tipo) values
  ('00000000-0000-4000-8000-0000000000d1', 'Parcheggio Esempio Uno Molto Lungo', 'Esempio Uno', 'autorimessa'),
  ('00000000-0000-4000-8000-0000000000d2', 'Parcheggio Esempio Due', null, 'autorimessa');

select pg_temp.act_as(pg_temp.id('collega'));
do $$
declare v uuid;
begin
  insert into public.parties (tipo, denominazione) values ('azienda', 'Azienda Pipeline Esempio Srl') returning id into v;
  insert into test_ids values ('p1', v);
  insert into public.party_locations (party_id, indirizzo, citta) values (v, 'Via Esempio 1', 'Milano');
  insert into public.contacts (party_id, nome, cognome) values (v, 'Mario', 'Esempio');
  insert into public.opportunities (party_id, parking_id, responsabile_id) values (v, '00000000-0000-4000-8000-0000000000d1', pg_temp.id('collega'))
  returning id into v;
  insert into test_ids values ('o1', v);
  insert into public.parties (tipo, denominazione) values ('azienda', 'Studio Senza Parcheggio Esempio') returning id into v;
  insert into test_ids values ('p2', v);
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- A1: party list with car parks
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));
select pg_temp.record(
  'lista soggetti: parcheggi con nome breve e fase; filtro per parcheggio e "nessun parcheggio"',
  (select parcheggi -> 0 ->> 'parcheggio' = 'Esempio Uno' and parcheggi -> 0 ->> 'fase' = 'individuata'
   from public.search_parties(p_query => 'Azienda Pipeline Esempio') where id = pg_temp.id('p1'))
  and exists (select 1 from public.search_parties(p_parcheggi => array['00000000-0000-4000-8000-0000000000d1'::uuid]) where id = pg_temp.id('p1'))
  and not exists (select 1 from public.search_parties(p_parcheggi => array['00000000-0000-4000-8000-0000000000d2'::uuid]) where id = pg_temp.id('p1'))
  and exists (select 1 from public.search_parties(p_senza_parcheggio => true, p_limit => 200) where id = pg_temp.id('p2'))
  and not exists (select 1 from public.search_parties(p_senza_parcheggio => true, p_limit => 200) where id = pg_temp.id('p1'))
);
reset role;

-- ---------------------------------------------------------------------------
-- A2: notes
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));
select public.save_notes('parking_facilities', '00000000-0000-4000-8000-0000000000d1', 'Ingresso da Via Esempio, chiedere al custode');
select public.save_notes('parties', pg_temp.id('p1'), 'Preferiscono essere chiamati al mattino');
with changed as (
  update public.parking_facilities set nome = 'Cambiato' where id = '00000000-0000-4000-8000-0000000000d1' returning 1
)
select pg_temp.record('note: l''operatore non modifica altri campi del parcheggio (nessuna riga aggiornata)', (select count(*) from changed) = 0);
reset role;
select pg_temp.record(
  'note: modificabili dall''operatore, con autore e data, registrate nell''audit',
  (select note = 'Ingresso da Via Esempio, chiedere al custode' and note_modificate_da = pg_temp.id('operatore') and note_modificate_il is not null
   from public.parking_facilities where id = '00000000-0000-4000-8000-0000000000d1')
  and (select note_modificate_da = pg_temp.id('operatore') from public.parties where id = pg_temp.id('p1'))
  and exists (select 1 from public.audit_logs where entita = 'parking_facilities' and azione = 'update'
              and utente_id = pg_temp.id('operatore') and dopo ->> 'note' like 'Ingresso%')
  and exists (select 1 from public.audit_logs where entita = 'parties' and azione = 'update'
              and utente_id = pg_temp.id('operatore') and dopo ->> 'note' like 'Preferiscono%')
);

-- ---------------------------------------------------------------------------
-- B1-B2: stages and lost outcome
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));
update public.opportunities set fase = 'contattata' where id = pg_temp.id('o1');
select pg_temp.expect_error(
  'fase: "Passata al BO" non impostabile a mano',
  format('update public.opportunities set fase = %L where id = %L', 'passata_bo', pg_temp.id('o1')), '42501'
);
select pg_temp.expect_error(
  'fase: "Attivata" non impostabile a mano',
  format('update public.opportunities set fase = %L where id = %L', 'attivata', pg_temp.id('o1')), '42501'
);
select pg_temp.expect_error(
  'persa senza motivo rifiutata',
  format('update public.opportunities set esito = %L where id = %L', 'persa', pg_temp.id('o1')), '23514'
);
-- Since block 1a-9 the reason is optional: "altro" without a note is
-- accepted (checked and rolled back here).
do $$
declare v_ok boolean;
begin
  begin
    update public.opportunities set esito = 'persa', motivo_perdita = 'altro' where id = pg_temp.id('o1');
    select esito = 'persa' and motivo_perdita = 'altro' into v_ok from public.opportunities where id = pg_temp.id('o1');
    raise exception using errcode = 'P0001', message = coalesce(v_ok, false)::text;
  exception when sqlstate 'P0001' then
    perform pg_temp.record('persa con motivo "altro" senza nota ammessa (motivo facoltativo dal blocco 1a-9)', sqlerrm = 'true');
  end;
end $$;
update public.opportunities set esito = 'persa', motivo_perdita = 'prezzo', prezzo_concorrente = 80, nota_perdita = 'Trovato altro garage'
where id = pg_temp.id('o1');
reset role;

select pg_temp.record(
  'cambi di fase ed esito nello storico, con l''autore (operatore su un''opportunità di un collega)',
  exists (select 1 from public.activities where opportunity_id = pg_temp.id('o1') and tipo = 'cambio_fase'
          and testo = 'Fase: Individuata → Contattata' and user_id = pg_temp.id('operatore'))
  and exists (select 1 from public.activities where opportunity_id = pg_temp.id('o1') and tipo = 'cambio_fase'
              and testo like 'Chiusa come persa: prezzo (prezzo del concorrente 80,00 €). Trovato altro garage')
);

-- A second open opportunity on the same pair: reopening the first is refused.
select pg_temp.act_as(pg_temp.id('collega'));
insert into public.opportunities (party_id, parking_id) values (pg_temp.id('p1'), '00000000-0000-4000-8000-0000000000d1');
select pg_temp.expect_error(
  'una sola opportunità aperta per soggetto e parcheggio (riapertura rifiutata)',
  format('update public.opportunities set esito = %L where id = %L', 'aperta', pg_temp.id('o1')), '23505'
);
delete from public.opportunities where party_id = pg_temp.id('p1') and esito = 'aperta';
reset role;
select pg_temp.record(
  'eliminazioni solo admin: l''operatore non cancella l''opportunità',
  (select count(*) from public.opportunities where party_id = pg_temp.id('p1') and esito = 'aperta') = 1
);
select pg_temp.act_as(pg_temp.id('admin'));
delete from public.opportunities where party_id = pg_temp.id('p1') and esito = 'aperta';
reset role;

select pg_temp.act_as(pg_temp.id('operatore'));
update public.opportunities set esito = 'aperta' where id = pg_temp.id('o1');
reset role;
select pg_temp.record(
  'riapri: torna aperta nella fase precedente, motivo e nota cancellati, storico',
  (select esito = 'aperta' and fase = 'contattata' and motivo_perdita is null and nota_perdita is null and prezzo_concorrente is null
   from public.opportunities where id = pg_temp.id('o1'))
  and exists (select 1 from public.activities where opportunity_id = pg_temp.id('o1') and testo = 'Riaperta in fase Contattata')
);

-- ---------------------------------------------------------------------------
-- B3-B4: activities and reminders
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));
select pg_temp.expect_error(
  '"richiamare" senza data della prossima attività rifiutato',
  format('select public.log_activity(%L, null, %L, %L)', pg_temp.id('o1'), 'chiamata', 'richiamare'), '23514'
);
insert into test_json
select 'call1', public.log_activity(pg_temp.id('o1'), null, 'chiamata', 'richiamare', 'Richiamare dopo le 15',
                                    date_trunc('day', now()) + interval '2 days 15 hours', 'chiamata');
reset role;
select pg_temp.record(
  'chiamata con "richiamare": attività registrata e prossima attività dell''opportunità aggiornata',
  exists (select 1 from public.activities where id = (pg_temp.j('call1') ->> 'activity_id')::uuid and esito = 'richiamare' and user_id = pg_temp.id('operatore'))
  and (select prossima_attivita_il = date_trunc('day', now()) + interval '2 days 15 hours' from public.opportunities where id = pg_temp.id('o1'))
  and (select assegnatario_id = pg_temp.id('operatore') and tipo = 'chiamata' from public.tasks where id = (pg_temp.j('call1') ->> 'task_id')::uuid)
);

select pg_temp.act_as(pg_temp.id('operatore'));
update public.tasks set scadenza = date_trunc('day', now()) + interval '5 days 9 hours' where id = (pg_temp.j('call1') ->> 'task_id')::uuid;
reset role;
select pg_temp.record(
  'rimanda: la nuova data diventa la prossima attività',
  (select prossima_attivita_il = date_trunc('day', now()) + interval '5 days 9 hours' from public.opportunities where id = pg_temp.id('o1'))
);

select pg_temp.act_as(pg_temp.id('operatore'));
insert into test_json select 'done1', public.complete_task((pg_temp.j('call1') ->> 'task_id')::uuid, 'risposto', 'Interessati');
reset role;
select pg_temp.record(
  'fatta: promemoria chiuso, chiamata registrata, nessuna prossima attività',
  (select completata_il is not null from public.tasks where id = (pg_temp.j('call1') ->> 'task_id')::uuid)
  and exists (select 1 from public.activities where id = (pg_temp.j('done1') ->> 'activity_id')::uuid and esito = 'risposto' and testo = 'Interessati')
  and (select prossima_attivita_il is null from public.opportunities where id = pg_temp.id('o1'))
);

-- First answered call on an opportunity still "Individuata": stage change proposed.
select pg_temp.act_as(pg_temp.id('collega'));
do $$
declare v uuid;
begin
  insert into public.opportunities (party_id, parking_id) values (pg_temp.id('p2'), '00000000-0000-4000-8000-0000000000d2') returning id into v;
  insert into test_ids values ('o2', v);
end $$;
insert into test_json select 'call2', public.log_activity(pg_temp.id('o2'), null, 'chiamata', 'risposto', null);
insert into test_json select 'call3', public.log_activity(pg_temp.id('o2'), null, 'chiamata', 'risposto', null);
reset role;
select pg_temp.record(
  'prima chiamata "risposto" su Individuata propone Contattata (solo la prima, senza cambiare fase)',
  (pg_temp.j('call2') ->> 'proponi_contattata')::boolean and not (pg_temp.j('call3') ->> 'proponi_contattata')::boolean
  and (select fase = 'individuata' from public.opportunities where id = pg_temp.id('o2'))
);

-- ---------------------------------------------------------------------------
-- A4: party deletion
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));
select pg_temp.expect_error(
  'eliminazione soggetto: l''operatore non può',
  format('select public.delete_party(%L)', pg_temp.id('p1')), '42501'
);
reset role;
select pg_temp.act_as(pg_temp.id('admin'));
insert into test_json select 'summary', public.party_delete_summary(pg_temp.id('p1'));
insert into test_json select 'deleted', public.delete_party(pg_temp.id('p1'));
reset role;
select pg_temp.record(
  'eliminazione soggetto (admin): riepilogo, tutto cancellato, voce di audit con autore',
  (pg_temp.j('summary') ->> 'sedi')::int = 1 and (pg_temp.j('summary') ->> 'contatti')::int = 1
  and (pg_temp.j('summary') ->> 'opportunita')::int = 1 and (pg_temp.j('summary') ->> 'attivita')::int >= 5
  and not exists (select 1 from public.parties where id = pg_temp.id('p1'))
  and not exists (select 1 from public.opportunities where id = pg_temp.id('o1'))
  and not exists (select 1 from public.activities where party_id = pg_temp.id('p1') or opportunity_id = pg_temp.id('o1'))
  and not exists (select 1 from public.tasks where opportunity_id = pg_temp.id('o1'))
  and not exists (select 1 from public.party_locations where party_id = pg_temp.id('p1'))
  and not exists (select 1 from public.contacts where party_id = pg_temp.id('p1'))
  and exists (select 1 from public.audit_logs where entita = 'parties' and azione = 'delete'
              and entita_id = pg_temp.id('p1') and utente_id = pg_temp.id('admin')),
  pg_temp.j('summary')::text
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

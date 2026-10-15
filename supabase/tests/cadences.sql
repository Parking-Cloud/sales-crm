-- Block 1a-8: template versions, optional signature, light cadences (working
-- days, steps, enrollments, automatic stops), export for Crono.
--
-- Run with all migrations applied, as the database owner:
--   npm run db:test   (Supabase Management API)
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/cadences.sql
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


delete from public.app_settings where chiave in ('ragione_sociale', 'email_opposizione');
insert into public.app_settings (chiave, valore) values ('ragione_sociale', '"Societa Esempio Srl"'), ('email_opposizione', '"opposizione@example.com"');
update public.app_settings set valore = 'false' where chiave = 'email_a_freddo';

insert into public.parking_facilities (id, nome, nome_breve, tipo) values
  ('00000000-0000-4000-8000-0000000000f1', 'Parcheggio Esempio Cadenze Uno', 'Cadenze Uno', 'autorimessa'),
  ('00000000-0000-4000-8000-0000000000f2', 'Parcheggio Esempio Cadenze Due', null, 'autorimessa');

do $$
declare v uuid;
begin
  insert into public.parties (tipo, denominazione, sito) values ('azienda', 'Azienda Esempio Cadenze Srl', 'https://cadenze-esempio.example') returning id into v;
  insert into test_ids values ('a', v);
  insert into public.party_locations (party_id, citta, principale) values (v, 'Milano', true);
  insert into public.contacts (party_id, nome, cognome, ruolo, email, telefono)
  values (v, 'Mario', 'Esempio', 'Responsabile, ufficio "acquisti"', 'mario.esempio@cadenze-esempio.example', '02 3333 4444') returning id into v;
  insert into test_ids values ('ca', v);
  insert into public.contacts (party_id, nome, cognome, email) values (pg_temp.id('a'), 'Lucia', 'Prova', 'lucia.prova@cadenze-esempio.example') returning id into v;
  insert into test_ids values ('cb', v);
  insert into public.parties (tipo, denominazione) values ('azienda', 'Studio Senza Contatti Esempio') returning id into v;
  insert into test_ids values ('b', v);
  insert into public.parties (tipo, denominazione, telefono) values ('azienda', 'Officina Esempio Esclusa', '02 7777 8888') returning id into v;
  insert into test_ids values ('c', v);
  insert into public.contacts (party_id, nome, email) values (v, 'Anna', 'anna@officina-esclusa.example');
  insert into public.parties (tipo, nome, cognome, email) values ('persona', 'Paolo', 'Cancellato', 'paolo.cancellato@example.com') returning id into v;
  insert into test_ids values ('g', v);
  insert into public.parties (tipo, denominazione) values ('azienda', 'Bar Esempio Due Parcheggi') returning id into v;
  insert into test_ids values ('d', v);
  insert into public.contacts (party_id, nome, telefono) values (v, 'Gino', '0255556666');
end $$;

with x as (insert into public.opportunities (party_id, parking_id, fase, responsabile_id)
  values (pg_temp.id('a'), '00000000-0000-4000-8000-0000000000f1', 'da_contattare', pg_temp.id('operatore')) returning id) insert into test_ids select 'oa', id from x;
with x as (insert into public.opportunities (party_id, parking_id) values (pg_temp.id('b'), '00000000-0000-4000-8000-0000000000f1') returning id) insert into test_ids select 'ob', id from x;
with x as (insert into public.opportunities (party_id, parking_id) values (pg_temp.id('c'), '00000000-0000-4000-8000-0000000000f1') returning id) insert into test_ids select 'oc', id from x;
with x as (insert into public.opportunities (party_id, parking_id) values (pg_temp.id('d'), '00000000-0000-4000-8000-0000000000f1') returning id) insert into test_ids select 'od1', id from x;
with x as (insert into public.opportunities (party_id, parking_id) values (pg_temp.id('d'), '00000000-0000-4000-8000-0000000000f2') returning id) insert into test_ids select 'od2', id from x;
with x as (insert into public.opportunities (party_id, parking_id, esito, motivo_perdita)
  values (pg_temp.id('a'), '00000000-0000-4000-8000-0000000000f2', 'persa', 'prezzo') returning id) insert into test_ids select 'oclosed', id from x;

-- ---------------------------------------------------------------------------
-- Working days
-- ---------------------------------------------------------------------------

select pg_temp.record(
  'giorni lavorativi: venerdì +1 = lunedì, sabato +0 = lunedì, mercoledì +2 = venerdì, giovedì +3 = martedì, lunedì +0 = lunedì',
  public.add_business_days('2026-10-16', 1) = '2026-10-19'
  and public.add_business_days('2026-10-17', 0) = '2026-10-19'
  and public.add_business_days('2026-10-14', 2) = '2026-10-16'
  and public.add_business_days('2026-10-15', 3) = '2026-10-20'
  and public.add_business_days('2026-10-19', 0) = '2026-10-19'
  and public.add_business_days('2026-10-16', 10) = '2026-10-30'
);
select pg_temp.record(
  'orario del passo in ora di Roma, anche dopo il cambio dell''ora (25 ottobre)',
  public.cadence_step_due('2026-10-23', 0, '10:30') = '2026-10-23 08:30:00+00'
  and public.cadence_step_due('2026-10-23', 1, '10:30') = '2026-10-26 09:30:00+00'
  and public.cadence_step_due('2026-10-23', 1, null) = '2026-10-26 08:00:00+00'
);

-- ---------------------------------------------------------------------------
-- A1: template versions
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('admin'));
insert into test_ids select 't1', public.save_email_template(null, 'Cadenze esempio', 'uffici', 'Oggetto {azienda}', 'Testo v1 finto');
insert into test_ids select 't2', public.save_email_template((select famiglia_id from public.email_templates where id = pg_temp.id('t1')), 'Cadenze esempio', 'uffici', 'Oggetto {azienda}', 'Testo v2 finto');
insert into test_ids select 't3', public.save_email_template((select famiglia_id from public.email_templates where id = pg_temp.id('t1')), 'Cadenze esempio', 'uffici', 'Oggetto {azienda}', 'Testo v3 finto');
select pg_temp.record(
  'versioni: l''ultima salvata è l''attiva, una sola per template',
  (select corrente from public.email_templates where id = pg_temp.id('t3'))
  and (select count(*) from public.email_templates where famiglia_id = (select famiglia_id from public.email_templates where id = pg_temp.id('t1')) and corrente) = 1
);
select public.use_template_version(pg_temp.id('t2'));
select pg_temp.record(
  '"Usa questa versione": la scelta diventa attiva ed è nell''audit con l''autore',
  (select corrente from public.email_templates where id = pg_temp.id('t2'))
  and not (select corrente from public.email_templates where id = pg_temp.id('t3'))
  and exists (select 1 from public.audit_logs where entita = 'email_templates' and entita_id = pg_temp.id('t2')
              and azione = 'update' and utente_id = pg_temp.id('admin') and (dopo ->> 'corrente')::boolean)
);
select pg_temp.expect_error(
  'versioni: quella attiva non si elimina',
  format($$delete from public.email_templates where id = %L$$, pg_temp.id('t2')),
  '42501'
);
with gone as (delete from public.email_templates where id = pg_temp.id('t3') returning 1)
select pg_temp.record('versioni: una versione mai usata e non attiva si elimina', (select count(*) from gone) = 1);
reset role;

-- ---------------------------------------------------------------------------
-- B1-B3: cadence, steps, enrollment
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));
select public.save_my_signature('', null, null, null);
with x as (insert into public.cadences (nome, descrizione) values ('Cadenza esempio', 'Tre passi finti') returning id) insert into test_ids select 'k', id from x;
insert into public.cadence_steps (cadence_id, posizione, tipo, attesa_giorni, orario, istruzioni) values (pg_temp.id('k'), 1, 'chiamata', 0, '10:00', 'Prima chiamata');
select pg_temp.expect_error(
  'passo email senza template rifiutato',
  format($$insert into public.cadence_steps (cadence_id, posizione, tipo, attesa_giorni) values (%L, 2, 'email', 2)$$, pg_temp.id('k')),
  '23514'
);
insert into public.cadence_steps (cadence_id, posizione, tipo, attesa_giorni, template_famiglia_id)
values (pg_temp.id('k'), 2, 'email', 2, (select famiglia_id from public.email_templates where id = pg_temp.id('t1')));
insert into public.cadence_steps (cadence_id, posizione, tipo, attesa_giorni, orario) values (pg_temp.id('k'), 3, 'chiamata', 3, '15:00');
insert into test_ids select 's1', id from public.cadence_steps where cadence_id = pg_temp.id('k') and posizione = 1;
insert into test_ids select 's2', id from public.cadence_steps where cadence_id = pg_temp.id('k') and posizione = 2;
insert into test_ids select 's3', id from public.cadence_steps where cadence_id = pg_temp.id('k') and posizione = 3;

create temp table enroll_result as
select * from public.enroll_in_cadence(pg_temp.id('k'),
  jsonb_build_array(
    jsonb_build_object('opportunity_id', pg_temp.id('oa')),
    jsonb_build_object('opportunity_id', pg_temp.id('ob')),
    jsonb_build_object('opportunity_id', pg_temp.id('oclosed'))),
  (now() at time zone 'Europe/Rome')::date);
grant all on enroll_result to authenticated;
select pg_temp.record(
  'iscrizione: iscritta con il contatto proposto; saltate "nessun contatto" e "opportunità chiusa"',
  (select esito = 'iscritta' and contact_id = pg_temp.id('ca') from enroll_result where opportunity_id = pg_temp.id('oa'))
  and (select motivo = 'Nessun contatto' from enroll_result where opportunity_id = pg_temp.id('ob'))
  and (select motivo = 'Opportunità chiusa' from enroll_result where opportunity_id = pg_temp.id('oclosed'))
);
insert into test_ids select 'ea', enrollment_id from enroll_result where opportunity_id = pg_temp.id('oa');
select pg_temp.record(
  'iscrizione: già in cadenza saltata (una sola iscrizione attiva per opportunità)',
  (select motivo = 'Già in una cadenza' from public.enroll_in_cadence(pg_temp.id('k'), jsonb_build_array(jsonb_build_object('opportunity_id', pg_temp.id('oa'))), current_date))
);
select pg_temp.expect_error(
  'una sola iscrizione attiva per opportunità, anche con un insert diretto',
  format($$insert into public.cadence_enrollments (cadence_id, opportunity_id, avvio) values (%L, %L, current_date)$$, pg_temp.id('k'), pg_temp.id('oa')),
  '23505'
);
select pg_temp.record(
  'iscrizione: il passo 1 è un promemoria con nome cadenza e "passo 1/3", alla data e ora calcolate, al responsabile',
  (select titolo = 'Cadenza esempio · passo 1/3' and tipo = 'chiamata' and assegnatario_id = pg_temp.id('operatore')
          and scadenza = public.cadence_step_due((now() at time zone 'Europe/Rome')::date, 0, '10:00') and nota = 'Prima chiamata'
   from public.tasks where cadence_enrollment_id = pg_temp.id('ea') and completata_il is null)
);
select pg_temp.expect_error(
  'un passo già usato non si modifica',
  format($$update public.cadence_steps set attesa_giorni = 5 where id = %L$$, pg_temp.id('s1')),
  '42501'
);
update public.cadence_steps set attesa_giorni = 2, istruzioni = 'Mandare la presentazione' where id = pg_temp.id('s2');
select pg_temp.record('un passo futuro si modifica (vale per tutti gli iscritti)', (select istruzioni = 'Mandare la presentazione' from public.cadence_steps where id = pg_temp.id('s2')));

-- Parties: two open opportunities without a car park chosen.
select pg_temp.record(
  'iscrizione da lista soggetti: più opportunità aperte senza parcheggio saltata; esclusione saltata',
  (select motivo = 'Più opportunità aperte: scegli il parcheggio' from public.enroll_parties_in_cadence(pg_temp.id('k'), array[pg_temp.id('d')], null, current_date))
);
reset role;

-- Editing: move, delete, duplicate.
select pg_temp.act_as(pg_temp.id('operatore'));
insert into public.cadence_steps (cadence_id, posizione, tipo, attesa_giorni, istruzioni) values (pg_temp.id('k'), 4, 'attivita', 1, 'Passo da spostare');
select public.move_cadence_step((select id from public.cadence_steps where cadence_id = pg_temp.id('k') and posizione = 4), -1);
select pg_temp.record(
  'riordina: un passo futuro sale di una posizione',
  (select istruzioni = 'Passo da spostare' from public.cadence_steps where cadence_id = pg_temp.id('k') and posizione = 3)
);
select pg_temp.expect_error(
  'riordina: un passo futuro non va prima di un passo già usato',
  format($$select public.move_cadence_step(%L, -1)$$, pg_temp.id('s2')),
  '42501'
);
select public.delete_cadence_step((select id from public.cadence_steps where cadence_id = pg_temp.id('k') and posizione = 3));
select pg_temp.record(
  'elimina: i passi successivi risalgono',
  (select array_agg(posizione order by posizione) = array[1, 2, 3] from public.cadence_steps where cadence_id = pg_temp.id('k'))
  and (select id = pg_temp.id('s3') from public.cadence_steps where cadence_id = pg_temp.id('k') and posizione = 3)
);
select pg_temp.expect_error(
  'elimina: un passo già usato non si elimina',
  format($$select public.delete_cadence_step(%L)$$, pg_temp.id('s1')),
  '42501'
);
insert into test_ids select 'kcopy', public.duplicate_cadence(pg_temp.id('k'));
select pg_temp.record(
  'duplica: copia con i passi',
  (select nome = 'Cadenza esempio (copia)' from public.cadences where id = pg_temp.id('kcopy'))
  and (select count(*) from public.cadence_steps where cadence_id = pg_temp.id('kcopy')) = 3
);
reset role;

-- ---------------------------------------------------------------------------
-- B4: execution
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));
select public.complete_task((select id from public.tasks where cadence_enrollment_id = pg_temp.id('ea') and completata_il is null), 'non_risponde', null);
select pg_temp.record(
  'completare un passo crea il successivo: email +2 giorni lavorativi dalla data di completamento',
  (select titolo = 'Cadenza esempio · passo 2/3' and tipo = 'email' and cadence_step_id = pg_temp.id('s2')
          and scadenza = public.cadence_step_due((now() at time zone 'Europe/Rome')::date, 2, null)
   from public.tasks where cadence_enrollment_id = pg_temp.id('ea') and completata_il is null)
);
-- Email step: Mario has no permission yet.
select pg_temp.expect_error(
  'passo email non ammesso: non si segna come inviato',
  format($$select public.record_sent_email(%L, %L, %L, %L, 'Oggetto', 'Corpo', %L)$$,
    pg_temp.id('a'), pg_temp.id('ca'), pg_temp.id('oa'), pg_temp.id('t2'),
    (select id from public.tasks where cadence_enrollment_id = pg_temp.id('ea') and completata_il is null)),
  '42501'
);
select pg_temp.record(
  'firma vuota: non blocca l''email',
  (select (c ->> 'ok')::boolean from jsonb_array_elements(public.email_eligibility(pg_temp.id('a'), pg_temp.id('ca')) -> 'controlli') c where c ->> 'codice' = 'firma')
);
select public.register_email_permission(pg_temp.id('ca'), null, 'richiesta_in_chiamata', 'Chiamata');
select public.record_sent_email(pg_temp.id('a'), pg_temp.id('ca'), pg_temp.id('oa'), pg_temp.id('t2'), 'Oggetto finto', 'Corpo finto',
  (select id from public.tasks where cadence_enrollment_id = pg_temp.id('ea') and completata_il is null));
select pg_temp.record(
  'passo email ammesso: "Segna come inviata" chiude il passo e crea il passo 3 (+3 giorni alle 15)',
  (select titolo = 'Cadenza esempio · passo 3/3' and scadenza = public.cadence_step_due((now() at time zone 'Europe/Rome')::date, 3, '15:00')
   from public.tasks where cadence_enrollment_id = pg_temp.id('ea') and completata_il is null)
  and exists (select 1 from public.communications where opportunity_id = pg_temp.id('oa') and stato = 'inviata' and template_id = pg_temp.id('t2'))
);
reset role;
select pg_temp.act_as(pg_temp.id('admin'));
select public.use_template_version(pg_temp.id('t1'));
select pg_temp.expect_error(
  'versione template usata in un''email (e non attiva): non si elimina',
  format($$delete from public.email_templates where id = %L$$, pg_temp.id('t2')),
  '42501'
);
reset role;
select pg_temp.act_as(pg_temp.id('operatore'));
select public.pause_cadence(pg_temp.id('ea'));
select pg_temp.record(
  'pausa: nessun promemoria aperto',
  (select stato = 'in_pausa' from public.cadence_enrollments where id = pg_temp.id('ea'))
  and not exists (select 1 from public.tasks where cadence_enrollment_id = pg_temp.id('ea') and completata_il is null)
);
select public.resume_cadence(pg_temp.id('ea'));
select pg_temp.record(
  'ripresa: lo stesso passo torna in Oggi da oggi',
  (select titolo = 'Cadenza esempio · passo 3/3' and scadenza = public.cadence_step_due((now() at time zone 'Europe/Rome')::date, 0, '15:00')
   from public.tasks where cadence_enrollment_id = pg_temp.id('ea') and completata_il is null)
);
select public.skip_cadence_step((select id from public.tasks where cadence_enrollment_id = pg_temp.id('ea') and completata_il is null), 'Prova');
select pg_temp.record(
  'saltare l''ultimo passo completa la cadenza, con lo storico',
  (select stato = 'completata' from public.cadence_enrollments where id = pg_temp.id('ea'))
  and exists (select 1 from public.activities where opportunity_id = pg_temp.id('oa') and testo like 'Cadenza "Cadenza esempio": %saltato%')
  and exists (select 1 from public.activities where opportunity_id = pg_temp.id('oa') and testo = 'Cadenza "Cadenza esempio": completata')
);

-- ---------------------------------------------------------------------------
-- B6: automatic and manual stops
-- ---------------------------------------------------------------------------

-- Fresh enrollments on A (again) and D.
insert into test_ids select 'ea2', enrollment_id from public.enroll_in_cadence(pg_temp.id('k'), jsonb_build_array(jsonb_build_object('opportunity_id', pg_temp.id('oa'))), current_date);
insert into test_ids select 'ed1', enrollment_id from public.enroll_parties_in_cadence(pg_temp.id('k'), array[pg_temp.id('d')], '00000000-0000-4000-8000-0000000000f1', current_date);
insert into test_ids select 'ed2', enrollment_id from public.enroll_in_cadence(pg_temp.id('k'), jsonb_build_array(jsonb_build_object('opportunity_id', pg_temp.id('od2'))), current_date);
update public.opportunities set fase = 'interessata' where id = pg_temp.id('oa');
select pg_temp.record(
  'stop automatico: fase Interessata = convertito, con il motivo nello storico, promemoria tolto',
  (select stato = 'fermata' and esito = 'convertito' from public.cadence_enrollments where id = pg_temp.id('ea2'))
  and not exists (select 1 from public.tasks where cadence_enrollment_id = pg_temp.id('ea2') and completata_il is null)
  and exists (select 1 from public.activities where opportunity_id = pg_temp.id('oa') and testo like 'Cadenza "Cadenza esempio": fermata. Fase Interessata%')
);
update public.opportunities set esito = 'persa', motivo_perdita = 'prezzo' where id = pg_temp.id('od1');
select pg_temp.record(
  'stop automatico: opportunità chiusa',
  (select stato = 'fermata' and esito = 'chiusa' from public.cadence_enrollments where id = pg_temp.id('ed1'))
);
select public.mark_do_not_contact('parties', pg_temp.id('d'), 'Non vuole essere chiamato', 'telefono');
select pg_temp.record(
  'stop automatico: "Non contattare"',
  (select stato = 'fermata' and esito = 'non_contattare' from public.cadence_enrollments where id = pg_temp.id('ed2'))
);
with x as (insert into public.opportunities (party_id, parking_id) values (pg_temp.id('d'), '00000000-0000-4000-8000-0000000000f1') returning id) insert into test_ids select 'od3', id from x;
select pg_temp.record(
  'iscrizione: soggetto da non contattare saltato con il motivo',
  (select motivo = 'Soggetto da non contattare o in lista di esclusione'
   from public.enroll_in_cadence(pg_temp.id('k'), jsonb_build_array(jsonb_build_object('opportunity_id', pg_temp.id('od3'))), current_date))
);
with x as (insert into public.opportunities (party_id, parking_id) values (pg_temp.id('a'), '00000000-0000-4000-8000-0000000000f2') returning id) insert into test_ids select 'oa3', id from x;
insert into test_ids select 'ea3', enrollment_id from public.enroll_in_cadence(pg_temp.id('k'), jsonb_build_array(jsonb_build_object('opportunity_id', pg_temp.id('oa3'))), current_date);
select public.stop_cadence(pg_temp.id('ea3'), 'risposto', 'Ha risposto alla chiamata');
select pg_temp.record(
  'stop dopo una chiamata con risposta: conta come "risposto"',
  (select stato = 'fermata' and esito = 'risposto' and motivo_stop = 'Ha risposto alla chiamata' from public.cadence_enrollments where id = pg_temp.id('ea3'))
);
insert into test_ids select 'ea4', enrollment_id from public.enroll_in_cadence(pg_temp.id('k'), jsonb_build_array(jsonb_build_object('opportunity_id', pg_temp.id('oa3'))), current_date);
select public.mark_do_not_contact('contacts', pg_temp.id('ca'), 'Il contatto non vuole email', 'email');
select pg_temp.record(
  'stop automatico: "Non contattare" sul contatto della cadenza',
  (select stato = 'fermata' and esito = 'non_contattare' from public.cadence_enrollments where id = pg_temp.id('ea4'))
);
reset role;

-- ---------------------------------------------------------------------------
-- C: export for Crono
-- ---------------------------------------------------------------------------

select public.add_suppression('telefono', '02 7777 8888', 'Opposizione', 'telefono');
update public.parties set gdpr_cancellato_il = now(), non_contattare = true where id = pg_temp.id('g');
select pg_temp.act_as(pg_temp.id('operatore'));
create temp table export_rows as
select * from public.crono_export_rows(array[pg_temp.id('a'), pg_temp.id('b'), pg_temp.id('c'), pg_temp.id('g')], null);
grant all on export_rows to authenticated;
select pg_temp.record(
  'esportazione: una riga per contatto, con parcheggio, fase, città e permesso',
  (select first_name = 'Lucia' and company = 'Azienda Esempio Cadenze Srl' and city = 'Milano' and email_permission = 'no' and not escluso
   from export_rows where contact_id = pg_temp.id('cb'))
  and (select count(*) from export_rows where party_id = pg_temp.id('b')) = 1
  and (select contact_id is null and not escluso from export_rows where party_id = pg_temp.id('b'))
);
select pg_temp.record(
  'esportazione: escluso il contatto da non contattare, il soggetto in lista di esclusione e quello cancellato per GDPR',
  (select escluso and motivo like 'Contatto%' from export_rows where contact_id = pg_temp.id('ca'))
  and (select bool_and(escluso) and bool_and(motivo like 'Soggetto%') from export_rows where party_id = pg_temp.id('c'))
  and (select bool_and(escluso) and bool_and(motivo = 'Cancellato per richiesta GDPR') from export_rows where party_id = pg_temp.id('g'))
);
select public.log_crono_export(2, 3);
reset role;
select pg_temp.record(
  'esportazione: nell''audit chi, quando e quante righe, senza dati',
  exists (select 1 from public.audit_logs where entita = 'esportazione_crono' and utente_id = pg_temp.id('operatore')
          and dopo = '{"righe_esportate": 2, "righe_escluse": 3}'::jsonb and prima is null)
);

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

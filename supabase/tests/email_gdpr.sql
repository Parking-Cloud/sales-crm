-- Block 1a-7: entry into the pipeline, email templates and signature, email
-- permissions and eligibility, suppression list, "do not contact", GDPR erasure.
--
-- Run with all migrations applied, as the database owner:
--   npm run db:test   (Supabase Management API)
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/email_gdpr.sql
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


-- Settings of the footer may already exist on the database: start without.
delete from public.app_settings where chiave in ('ragione_sociale', 'email_opposizione');
update public.app_settings set valore = 'false' where chiave = 'email_a_freddo';

insert into public.parking_facilities (id, nome, nome_breve, tipo, lat, lng) values
  ('00000000-0000-4000-8000-0000000000e1', 'Parcheggio Esempio Email Uno', 'Email Uno', 'autorimessa', 45.4642, 9.19),
  ('00000000-0000-4000-8000-0000000000e2', 'Parcheggio Esempio Email Due', null, 'autorimessa', 45.5, 9.3);

do $$
declare v uuid;
begin
  -- Party A: company with a contact asked by phone, one without permission.
  insert into public.parties (tipo, denominazione, telefono, email, sito, piva)
  values ('azienda', 'Azienda Esempio Email Srl', '02 1111 2222', 'info@azienda-esempio-email.example', 'https://azienda-esempio-email.example', '98765432109')
  returning id into v;
  insert into test_ids values ('a', v);
  insert into public.party_locations (party_id, indirizzo, citta, principale, lat, lng, coordinate_fonte)
  values (v, 'Via Esempio 10', 'Milano', true, 45.465, 9.19, 'manuale');
  insert into public.contacts (party_id, nome, cognome, email, telefono)
  values (v, 'Mario', 'Esempio', 'mario.esempio@azienda-esempio-email.example', '347 111 2222') returning id into v;
  insert into test_ids values ('ca', v);
  insert into public.contacts (party_id, nome, cognome, email)
  values (pg_temp.id('a'), 'Lucia', 'Prova', 'lucia.prova@azienda-esempio-email.example') returning id into v;
  insert into test_ids values ('cb', v);
  insert into public.contacts (party_id, nome, cognome) values (pg_temp.id('a'), 'Senza', 'Email') returning id into v;
  insert into test_ids values ('cc', v);

  -- Party B: a person, erased on GDPR request.
  insert into public.parties (tipo, nome, cognome, telefono, email, note)
  values ('persona', 'Giovanni', 'Finto', '+39 333 444 5555', 'giovanni.finto@example.com', 'Chiamare dopo le 18')
  returning id into v;
  insert into test_ids values ('b', v);
  insert into public.party_locations (party_id, indirizzo, citta) values (v, 'Via Finta 5', 'Monza');
  insert into public.external_references (entita, entita_id, sistema, id_esterno) values ('parties', v, 'google_places', 'PlaceEsempioGdpr1');
  insert into public.contacts (party_id, nome, email, telefono) values (v, 'Giovanni', 'g.finto@studio-finto.example', '0399876543')
  returning id into v;
  insert into test_ids values ('cbx', v);

  -- Party C: two open opportunities, then "do not contact".
  insert into public.parties (tipo, denominazione, telefono) values ('azienda', 'Officina Esempio Opposta', '02 5555 6666') returning id into v;
  insert into test_ids values ('c', v);
end $$;

-- ---------------------------------------------------------------------------
-- A1: add to a car park
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));
create temp table add_result as
select * from public.add_to_parking(array[pg_temp.id('a'), pg_temp.id('c')], '00000000-0000-4000-8000-0000000000e1');
grant all on add_result to authenticated;
select pg_temp.record(
  'aggiungi a parcheggio: opportunità in "Individuata" assegnata a chi la crea',
  (select count(*) from add_result where esito = 'creata') = 2
  and (select bool_and(o.fase = 'individuata' and o.responsabile_id = pg_temp.id('operatore'))
       from public.opportunities o join add_result r on r.opportunity_id = o.id)
);
insert into test_ids select 'oa', opportunity_id from add_result where party_id = pg_temp.id('a');
insert into test_ids select 'oc', opportunity_id from add_result where party_id = pg_temp.id('c');
delete from add_result;
insert into add_result select * from public.add_to_parking(array[pg_temp.id('a')], '00000000-0000-4000-8000-0000000000e1');
select pg_temp.record(
  'aggiungi a parcheggio: stessa coppia con opportunità aperta saltata, con il link a quella esistente',
  (select esito = 'saltata' and opportunity_id = pg_temp.id('oa') and motivo like 'Ha già%' from add_result)
);
select pg_temp.expect_error(
  'opportunità duplicata per la stessa coppia: bloccata anche con un insert diretto',
  format($$insert into public.opportunities (party_id, parking_id) values (%L, '00000000-0000-4000-8000-0000000000e1')$$, pg_temp.id('a')),
  '23505'
);
select pg_temp.record(
  'aggiungi a parcheggio: distanza dalla sede calcolata, opportunità aperta indicata',
  (select distanza_m between 0 and 200 and opportunity_id = pg_temp.id('oa')
   from public.party_parking_options(pg_temp.id('a')) where parking_id = '00000000-0000-4000-8000-0000000000e1')
  and (select opportunity_id is null from public.party_parking_options(pg_temp.id('a')) where parking_id = '00000000-0000-4000-8000-0000000000e2')
);
select public.add_to_parking(array[pg_temp.id('c')], '00000000-0000-4000-8000-0000000000e2', 'interessata', 'contatto_in_entrata');
select pg_temp.record(
  'nuovo soggetto con parcheggio: fase e origine salvate',
  exists (select 1 from public.opportunities where party_id = pg_temp.id('c') and parking_id = '00000000-0000-4000-8000-0000000000e2'
          and fase = 'interessata' and origine = 'contatto_in_entrata')
);
select pg_temp.expect_error(
  'aggiungi a parcheggio: non si parte da una fase avanzata',
  format($$select * from public.add_to_parking(array[%L::uuid], '00000000-0000-4000-8000-0000000000e2', 'vinta')$$, pg_temp.id('b')),
  '22023'
);
reset role;

-- ---------------------------------------------------------------------------
-- B1: templates
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('admin'));
select pg_temp.expect_error(
  'template: variabile sconosciuta rifiutata, con il nome nel messaggio',
  $$select public.save_email_template(null, 'Prova', 'uffici', 'Ciao {azienda}', 'Testo {sconosciuta} e {firma}')$$,
  '23514'
);
select pg_temp.record(
  'template: elenco delle variabili sconosciute',
  public.template_unknown_variables('{azienda} {nome} {x} {nome}') = array['nome', 'x']
);
insert into test_ids select 't1', public.save_email_template(null, 'Uffici esempio', 'uffici', 'Parcheggio per {azienda}', 'Gentile {referente}, testo finto. {firma}');
insert into test_ids select 't2', public.save_email_template(
  (select famiglia_id from public.email_templates where id = pg_temp.id('t1')), 'Uffici esempio', 'uffici', 'Parcheggio per {azienda}', 'Testo finto v2. {prodotti_prezzi} {firma}');
select pg_temp.record(
  'template: ogni salvataggio è una nuova versione, la precedente resta uguale',
  (select versione from public.email_templates where id = pg_temp.id('t1')) = 1
  and (select versione from public.email_templates where id = pg_temp.id('t2')) = 2
  and (select corpo from public.email_templates where id = pg_temp.id('t1')) = 'Gentile {referente}, testo finto. {firma}'
);
select pg_temp.expect_error(
  'template: una versione salvata non si modifica',
  format($$update public.email_templates set corpo = 'Cambiato' where id = %L$$, pg_temp.id('t1')),
  '42501'
);
select pg_temp.expect_error(
  'template: la versione attiva non si cancella (1a-8)',
  format($$delete from public.email_templates where id = %L$$, pg_temp.id('t2')),
  '42501'
);
reset role;
select pg_temp.act_as(pg_temp.id('operatore'));
select pg_temp.expect_error(
  'template: l''operatore non salva template',
  $$select public.save_email_template(null, 'Prova', 'uffici', 'Oggetto', 'Corpo')$$,
  '42501'
);
reset role;

-- ---------------------------------------------------------------------------
-- B2-B5: signature, permissions, eligibility, "Segna come inviata"
-- ---------------------------------------------------------------------------

create function pg_temp.check_ok(p_check jsonb, p_code text) returns boolean language sql as $$
  select (c ->> 'ok')::boolean from jsonb_array_elements(p_check -> 'controlli') c where c ->> 'codice' = p_code
$$;

select pg_temp.act_as(pg_temp.id('operatore'));
insert into test_json select 'e0', public.email_eligibility(pg_temp.id('a'), pg_temp.id('ca'));
select pg_temp.record(
  'ammissibilità: senza permesso e piede l''email non è ammessa, con i motivi; la firma vuota non blocca (1a-8)',
  not (pg_temp.j('e0') ->> 'ammessa')::boolean
  and not pg_temp.check_ok(pg_temp.j('e0'), 'permesso')
  and pg_temp.check_ok(pg_temp.j('e0'), 'firma')
  and not pg_temp.check_ok(pg_temp.j('e0'), 'piede')
  and pg_temp.check_ok(pg_temp.j('e0'), 'esclusione')
);
select public.save_my_signature('Operatore Di Prova', 'Commerciale', '+39 02 0000 0000', null);
reset role;
select pg_temp.record(
  'firma: ognuno salva la propria',
  (select firma_nome = 'Operatore Di Prova' and firma_ruolo = 'Commerciale' from public.users where id = pg_temp.id('operatore'))
  and (select firma_nome is null from public.users where id = pg_temp.id('admin'))
);
select pg_temp.act_as(pg_temp.id('operatore'));
select pg_temp.expect_error(
  'piede: l''operatore non imposta la ragione sociale',
  $$insert into public.app_settings (chiave, valore) values ('ragione_sociale', '"Societa Esempio Srl"')$$,
  '42501'
);
reset role;
select pg_temp.act_as(pg_temp.id('admin'));
insert into public.app_settings (chiave, valore) values ('ragione_sociale', '"Societa Esempio Srl"'), ('email_opposizione', '"opposizione@example.com"');
select pg_temp.expect_error(
  'piede: indirizzo di opposizione non valido rifiutato',
  $$update public.app_settings set valore = '"non valido"' where chiave = 'email_opposizione'$$,
  '23514'
);
reset role;

select pg_temp.act_as(pg_temp.id('operatore'));
select pg_temp.expect_error(
  'invio non ammesso senza permesso: "Segna come inviata" rifiutato',
  format($$select public.record_sent_email(%L, %L, %L, null, 'Oggetto finto', 'Corpo finto')$$, pg_temp.id('a'), pg_temp.id('cb'), pg_temp.id('oa')),
  '42501'
);
select pg_temp.expect_error(
  'invio non ammesso senza permesso: anche con un insert diretto in communications',
  format($$insert into public.communications (party_id, contact_id, a, oggetto, corpo, stato) values (%L, %L, 'lucia.prova@azienda-esempio-email.example', 'O', 'C', 'inviata')$$,
         pg_temp.id('a'), pg_temp.id('cb')),
  '42501'
);
select pg_temp.expect_error(
  'permesso: non si inserisce direttamente (solo con la funzione che controlla)',
  format($$insert into public.contact_permissions (contact_id, canale, base, data) values (%L, 'email', 'consenso', now())$$, pg_temp.id('cb')),
  '42501'
);
select pg_temp.expect_error(
  'permesso: serve un indirizzo email',
  format($$select public.register_email_permission(%L, null, 'richiesta_in_chiamata')$$, pg_temp.id('cc')),
  '23514'
);
select public.register_email_permission(pg_temp.id('cc'), null, 'richiesta_in_chiamata', 'Chiamata', now(), 'senza.email@azienda-esempio-email.example');
select pg_temp.record(
  'permesso: l''indirizzo mancante si salva sul contatto',
  (select email = 'senza.email@azienda-esempio-email.example' from public.contacts where id = pg_temp.id('cc'))
);
select public.register_email_permission(pg_temp.id('ca'), null, 'richiesta_in_chiamata', 'Chiamata del commerciale');
insert into test_json select 'e1', public.email_eligibility(pg_temp.id('a'), pg_temp.id('ca'));
select pg_temp.record(
  'ammissibilità: con permesso, firma e piede l''email è ammessa',
  (pg_temp.j('e1') ->> 'ammessa')::boolean
  and pg_temp.j('e1') ->> 'destinatario' = 'mario.esempio@azienda-esempio-email.example'
  and pg_temp.j('e1') -> 'permesso' ->> 'base' = 'richiesta_in_chiamata'
  and pg_temp.j('e1') -> 'permesso' ->> 'operatore' = 'Operatore Di Prova'
);
insert into test_ids select 'm1', public.record_sent_email(pg_temp.id('a'), pg_temp.id('ca'), pg_temp.id('oa'), pg_temp.id('t2'), 'Oggetto finto', 'Corpo finto');
reset role;
select pg_temp.record(
  '"Segna come inviata": comunicazione inviata con controllo, autore e data, attività email nello storico',
  (select stato = 'inviata' and a = 'mario.esempio@azienda-esempio-email.example' and created_by = pg_temp.id('operatore')
          and approvata_da = pg_temp.id('operatore') and inviata_il is not null
          and (controllo_ammissibilita ->> 'ammessa')::boolean and template_id = pg_temp.id('t2')
   from public.communications where id = pg_temp.id('m1'))
  and exists (select 1 from public.activities where communication_id = pg_temp.id('m1') and tipo = 'email'
              and user_id = pg_temp.id('operatore') and opportunity_id = pg_temp.id('oa') and testo = 'Email inviata: Oggetto finto')
);
select pg_temp.act_as(pg_temp.id('operatore'));
with changed as (update public.communications set corpo = 'Cambiato' where id = pg_temp.id('m1') returning 1)
select pg_temp.record('comunicazione inviata: non si modifica (nessuna riga)', (select count(*) from changed) = 0);

-- Suppression list: the contact's phone, the domain, the party's phone.
select public.add_suppression('telefono', '347 1112222', 'Opposizione al telefono', 'telefono');
insert into test_json select 'e2', public.email_eligibility(pg_temp.id('a'), pg_temp.id('ca'));
select pg_temp.record(
  'ammissibilità: non ammessa con il telefono del contatto in esclusione (il valore non è mostrato)',
  not (pg_temp.j('e2') ->> 'ammessa')::boolean
  and not pg_temp.check_ok(pg_temp.j('e2'), 'esclusione')
  and pg_temp.j('e2')::text like '%telefono del contatto%'
  and pg_temp.j('e2')::text not like '%3471112222%'
);
select pg_temp.expect_error(
  'invio non ammesso con il contatto in esclusione',
  format($$select public.record_sent_email(%L, %L, null, null, 'Oggetto', 'Corpo')$$, pg_temp.id('a'), pg_temp.id('ca')),
  '42501'
);
select pg_temp.expect_error(
  'esclusioni: l''operatore non rimuove',
  $$select public.remove_suppression((select id from public.suppression_list where valore_normalizzato = '+393471112222'), 'Errore')$$,
  '42501'
);
reset role;
select pg_temp.act_as(pg_temp.id('admin'));
select pg_temp.expect_error(
  'esclusioni: la rimozione richiede il motivo',
  $$select public.remove_suppression((select id from public.suppression_list where valore_normalizzato = '+393471112222'), ' ')$$,
  '23514'
);
select public.remove_suppression((select id from public.suppression_list where valore_normalizzato = '+393471112222'), 'Inserito per errore');
with gone as (delete from public.suppression_list returning 1)
select pg_temp.record('esclusioni: nessuna cancellazione definitiva, nemmeno dall''admin', (select count(*) from gone) = 0);
reset role;
select pg_temp.record(
  'esclusioni: rimozione dell''admin con motivo, autore e data (resta nello storico)',
  (select rimossa_da = pg_temp.id('admin') and motivo_rimozione = 'Inserito per errore' and rimossa_il is not null
   from public.suppression_list where valore_normalizzato = '+393471112222')
  and exists (select 1 from public.audit_logs where entita = 'suppression_list' and azione = 'update'
              and utente_id = pg_temp.id('admin') and dopo ->> 'motivo_rimozione' = 'Inserito per errore')
);
select pg_temp.act_as(pg_temp.id('operatore'));
select pg_temp.record(
  'ammissibilità: dopo la rimozione di nuovo ammessa',
  (public.email_eligibility(pg_temp.id('a'), pg_temp.id('ca')) ->> 'ammessa')::boolean
);
select public.add_suppression('dominio', 'https://www.azienda-esempio-email.example/contatti', 'Ha chiesto di non essere contattata', 'email');
select pg_temp.record(
  'ammissibilità: non ammessa con il dominio in esclusione',
  not (public.email_eligibility(pg_temp.id('a'), pg_temp.id('ca')) ->> 'ammessa')::boolean
);
select pg_temp.expect_error(
  'esclusioni: dominio generico rifiutato',
  $$select public.add_suppression('dominio', 'gmail.com', 'Prova')$$,
  '22023'
);
reset role;
update public.suppression_list set rimossa_il = now(), rimossa_da = pg_temp.id('admin'), motivo_rimozione = 'Fine test'
where valore_normalizzato = 'azienda-esempio-email.example';
select pg_temp.act_as(pg_temp.id('operatore'));
select public.add_suppression('telefono', '02 11112222', 'Opposizione del centralino', 'telefono');
select pg_temp.record(
  'ammissibilità: non ammessa con il telefono del soggetto in esclusione',
  not (public.email_eligibility(pg_temp.id('a'), pg_temp.id('ca')) ->> 'ammessa')::boolean
);
reset role;
update public.suppression_list set rimossa_il = now(), rimossa_da = pg_temp.id('admin'), motivo_rimozione = 'Fine test'
where valore_normalizzato = '+390211112222';

-- Cold email
select pg_temp.act_as(pg_temp.id('admin'));
update public.app_settings set valore = 'true' where chiave = 'email_a_freddo';
reset role;
select pg_temp.act_as(pg_temp.id('operatore'));
select pg_temp.record(
  'email a freddo attiva: contatto senza permesso ammesso (spenta di default)',
  (public.email_eligibility(pg_temp.id('a'), pg_temp.id('cb')) ->> 'ammessa')::boolean
);
reset role;
update public.app_settings set valore = 'false' where chiave = 'email_a_freddo';

-- ---------------------------------------------------------------------------
-- C1: "Non contattare" closes the opportunities and blocks imports
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));
insert into public.tasks (opportunity_id, titolo, scadenza) values (pg_temp.id('oc'), 'Richiamare', now() + interval '1 day');
insert into test_json select 'dnc', public.mark_do_not_contact('parties', pg_temp.id('c'), 'Ha risposto di non chiamare più', 'telefono');
reset role;
select pg_temp.record(
  'non contattare: opportunità aperte chiuse come perse ("non contattare"), promemoria chiusi',
  (pg_temp.j('dnc') ->> 'opportunita_chiuse')::integer = 2
  and not exists (select 1 from public.opportunities where party_id = pg_temp.id('c') and esito = 'aperta')
  and (select bool_and(motivo_perdita = 'non_contattare') from public.opportunities where party_id = pg_temp.id('c'))
  and not exists (select 1 from public.tasks where opportunity_id = pg_temp.id('oc') and completata_il is null)
  and exists (select 1 from public.activities where opportunity_id = pg_temp.id('oc') and tipo = 'cambio_fase'
              and testo like 'Chiusa come persa: ha chiesto di non essere contattato%' and user_id = pg_temp.id('operatore'))
  and (select canale = 'telefono' and motivo = 'Ha risposto di non chiamare più' from public.suppression_list where valore_normalizzato = '+390255556666')
);
select pg_temp.act_as(pg_temp.id('operatore'));
select pg_temp.record(
  'non contattare: un nuovo import (file o mappa) con lo stesso telefono è bloccato',
  exists (select 1 from public.check_import_rows('[{"ref": "r1", "party": {"denominazione": "Officina Nuova", "telefono": "0255556666"}}]'::jsonb)
          where livello = 'blocco' and motivo like 'Nella lista di esclusione%')
);
reset role;

-- ---------------------------------------------------------------------------
-- C3: GDPR erasure
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));
select public.register_email_permission(pg_temp.id('cbx'), null, 'consenso', 'Modulo firmato');
select public.log_activity(null, pg_temp.id('b'), 'nota', null, 'Ha detto che lavora a Monza', null, null, null);
select pg_temp.expect_error(
  'GDPR: l''operatore non può cancellare',
  format($$select public.gdpr_erase('parties', %L)$$, pg_temp.id('b')),
  '42501'
);
reset role;
select pg_temp.act_as(pg_temp.id('admin'));
insert into test_json select 'gdpr', public.gdpr_erase('parties', pg_temp.id('b'));
reset role;
select pg_temp.record(
  'GDPR: del soggetto resta solo l''identificativo minimo',
  (select cognome = 'Prospect cancellato (GDPR)' and nome is null and telefono is null and email is null and note is null
          and non_contattare and gdpr_cancellato_il is not null
   from public.parties where id = pg_temp.id('b'))
  and not exists (select 1 from public.contacts where party_id = pg_temp.id('b'))
  and not exists (select 1 from public.party_locations where party_id = pg_temp.id('b'))
  and not exists (select 1 from public.external_references where entita_id = pg_temp.id('b'))
  and not exists (select 1 from public.contact_permissions where party_id = pg_temp.id('b') or contact_id = pg_temp.id('cbx'))
  and not exists (select 1 from public.activities where party_id = pg_temp.id('b') and testo is not null)
);
select pg_temp.record(
  'GDPR: in lista di esclusione solo l''hash, senza il valore in chiaro',
  (select count(*) from public.suppression_list where gdpr and valore_normalizzato is null and rimossa_il is null) >= 5
  and not exists (select 1 from public.suppression_list where valore_normalizzato in ('+393334445555', 'giovanni.finto@example.com', '+390399876543', 'PlaceEsempioGdpr1'))
);
select pg_temp.record(
  'GDPR: l''audit registra la cancellazione con l''autore, senza i dati cancellati',
  exists (select 1 from public.audit_logs where entita = 'parties' and entita_id = pg_temp.id('b') and azione = 'delete'
          and utente_id = pg_temp.id('admin') and dopo ->> 'gdpr' is not null and (dopo ->> 'contatti')::int = 1)
  and not exists (select 1 from public.audit_logs
                  where entita <> 'email_templates'
                    and (prima::text || coalesce(dopo::text, '')) ~* '(giovanni|finto|3334445555|chiamare dopo)')
);
select pg_temp.act_as(pg_temp.id('operatore'));
select pg_temp.record(
  'GDPR: un nuovo import con lo stesso telefono o la stessa email è bloccato',
  exists (select 1 from public.check_import_rows('[{"ref": "r1", "party": {"nome": "Giovanni", "telefono": "333 4445555"}}]'::jsonb)
          where livello = 'blocco' and motivo = 'Nella lista di esclusione (telefono)')
  and exists (select 1 from public.check_import_rows('[{"ref": "r2", "party": {"nome": "G", "email": "Giovanni.Finto@example.com"}}]'::jsonb)
          where livello = 'blocco' and motivo = 'Nella lista di esclusione (email)')
  and exists (select 1 from public.check_party_duplicates(p_place_id => 'PlaceEsempioGdpr1') where livello = 'blocco')
);
select pg_temp.expect_error(
  'GDPR: l''operatore non può rimuovere le voci della cancellazione',
  $$select public.remove_suppression((select id from public.suppression_list where gdpr limit 1), 'Prova')$$,
  '42501'
);
reset role;
select pg_temp.act_as(pg_temp.id('admin'));
select pg_temp.expect_error(
  'GDPR: nemmeno l''admin rimuove le voci della cancellazione',
  $$select public.remove_suppression((select id from public.suppression_list where gdpr limit 1), 'Prova')$$,
  'P0002'
);
insert into test_json select 'gdpr_c', public.gdpr_erase('contacts', pg_temp.id('cb'));
reset role;
select pg_temp.record(
  'GDPR su un solo contatto: contatto cancellato, soggetto intatto, email bloccata',
  not exists (select 1 from public.contacts where id = pg_temp.id('cb'))
  and (select denominazione = 'Azienda Esempio Email Srl' from public.parties where id = pg_temp.id('a'))
  and public.is_suppressed(array['lucia.prova@azienda-esempio-email.example'])
);
select pg_temp.record(
  'GDPR: le comunicazioni del soggetto restano senza testo né destinatario',
  not exists (select 1 from public.communications where party_id = pg_temp.id('b') and (corpo is not null or a is not null))
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

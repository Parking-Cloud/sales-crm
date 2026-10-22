-- Block 1a-9: prospect status, pipeline (offer status), manual reminders.
-- Mapping of the existing data, automatic entry and exit of the pipeline,
-- no duplicate pipeline rows, reminder days in Europe/Rome, inline edits in
-- the audit, main contact, permission from the email pop-up, suppression
-- list still blocking, list reads.
--
-- Run with all migrations applied, as the database owner:
--   npm run db:test   (Supabase Management API)
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/prospect.sql
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

-- Offer status of a pair (null = not in the pipeline).
create function pg_temp.offer(party text, parking uuid) returns text language sql stable as $$
  select string_agg(coalesce(stato_offerta::text, '-'), ',' order by created_at)
  from public.opportunities where party_id = pg_temp.id(party) and parking_id = parking
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

delete from public.app_settings where chiave in ('ragione_sociale', 'email_opposizione');
insert into public.app_settings (chiave, valore) values ('ragione_sociale', '"Societa Esempio Srl"'), ('email_opposizione', '"opposizione@example.com"');
update public.app_settings set valore = 'false' where chiave = 'email_a_freddo';

insert into public.parking_facilities (id, nome, nome_breve, tipo) values
  ('00000000-0000-4000-8000-0000000000e1', 'Parcheggio Esempio Prospect Uno', 'Prospect Uno', 'autorimessa'),
  ('00000000-0000-4000-8000-0000000000e2', 'Parcheggio Esempio Prospect Due', 'Prospect Due', 'autorimessa'),
  ('00000000-0000-4000-8000-0000000000e3', 'Parcheggio Esempio Prospect Tre', 'Prospect Tre', 'autorimessa');

-- Legacy data, before the mapping (status and offer still empty):
-- m1 open at Contattata; m2 Interessata; m3 lost at Contattata; m4 lost after
-- the offer; m5 won; m6 Offerta inviata + an open one on another car park;
-- m7 lost before the offer on one car park and open on another; m8 none.
do $$
declare
  v uuid;
  k text;
begin
  foreach k in array array['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'] loop
    insert into public.parties (tipo, denominazione) values ('azienda', 'Azienda Esempio Mappatura ' || upper(k) || ' Srl') returning id into v;
    insert into test_ids values (k, v);
  end loop;
end $$;

alter table public.opportunities disable trigger apply_offer_status;
insert into public.opportunities (party_id, parking_id, fase, esito, motivo_perdita) values
  (pg_temp.id('m1'), '00000000-0000-4000-8000-0000000000e1', 'contattata', 'aperta', null),
  (pg_temp.id('m2'), '00000000-0000-4000-8000-0000000000e1', 'interessata', 'aperta', null),
  (pg_temp.id('m3'), '00000000-0000-4000-8000-0000000000e1', 'contattata', 'persa', 'trasloco'),
  (pg_temp.id('m4'), '00000000-0000-4000-8000-0000000000e1', 'offerta_inviata', 'persa', 'prezzo'),
  (pg_temp.id('m5'), '00000000-0000-4000-8000-0000000000e1', 'vinta', 'vinta', null),
  (pg_temp.id('m6'), '00000000-0000-4000-8000-0000000000e1', 'offerta_inviata', 'aperta', null),
  (pg_temp.id('m6'), '00000000-0000-4000-8000-0000000000e2', 'individuata', 'aperta', null),
  (pg_temp.id('m7'), '00000000-0000-4000-8000-0000000000e1', 'contattata', 'persa', 'nessun_bisogno'),
  (pg_temp.id('m7'), '00000000-0000-4000-8000-0000000000e2', 'individuata', 'aperta', null);
alter table public.opportunities enable trigger apply_offer_status;
update public.opportunities set prossima_attivita_il = '2026-10-21 23:30:00+00'
where party_id = pg_temp.id('m6') and parking_id = '00000000-0000-4000-8000-0000000000e1';

-- Prospects of the live rules: p1 with a contact and two car parks, p2 with
-- its own telephone only, p3 in the suppression list.
do $$
declare v uuid;
begin
  insert into public.parties (tipo, denominazione, categoria, telefono, email) values
    ('azienda', 'Azienda Esempio Prospect Srl', 'Uffici', '02 1111 2222', 'info@prospect-esempio.example') returning id into v;
  insert into test_ids values ('p1', v);
  insert into public.contacts (party_id, nome, cognome, email, telefono, created_at)
  values (v, 'Mario', 'Esempio', 'mario@prospect-esempio.example', '02 3333 4444', now() - interval '1 day') returning id into v;
  insert into test_ids values ('c1', v);
  insert into public.contacts (party_id, nome, email) values (pg_temp.id('p1'), 'Secondo', 'secondo@prospect-esempio.example');
  insert into public.parties (tipo, denominazione, telefono) values ('azienda', 'Studio Esempio Senza Contatti', '06 5555 6666') returning id into v;
  insert into test_ids values ('p2', v);
  insert into public.parties (tipo, denominazione, email) values ('azienda', 'Officina Esempio Esclusa', 'officina@esclusa-esempio.example') returning id into v;
  insert into test_ids values ('p3', v);
end $$;

-- ---------------------------------------------------------------------------
-- Mapping of the existing data
-- ---------------------------------------------------------------------------

insert into test_json select 'map', public.map_prospect_status(array(select id from test_ids where key like 'm_'));

select pg_temp.record(
  'mappatura: Contattata = Da contattare, Interessata e Vinta = Interessato, persa prima dell''offerta = Non interessato, persa dopo = Interessato',
  (select string_agg(p.stato_prospect::text, ',' order by t.key) from public.parties p join test_ids t on t.id = p.id where t.key like 'm_')
    = 'da_contattare,interessato,non_interessato,interessato,interessato,interessato,da_contattare,da_contattare',
  (select string_agg(t.key || '=' || p.stato_prospect, ',' order by t.key) from public.parties p join test_ids t on t.id = p.id where t.key like 'm_')
);
select pg_temp.record(
  'mappatura: motivo del Non interessato dalla sua ultima opportunità persa',
  (select motivo_non_interesse = 'trasloco' from public.parties where id = pg_temp.id('m3'))
  and (select motivo_non_interesse is null from public.parties where id = pg_temp.id('m7'))
);
select pg_temp.record(
  'mappatura: stato offerta da inviare, inviata, accettata, rifiutata (motivo tenuto); fuori le coppie dei non interessati',
  pg_temp.offer('m1', '00000000-0000-4000-8000-0000000000e1') = '-'
  and pg_temp.offer('m2', '00000000-0000-4000-8000-0000000000e1') = 'da_inviare'
  and pg_temp.offer('m3', '00000000-0000-4000-8000-0000000000e1') = '-'
  and pg_temp.offer('m4', '00000000-0000-4000-8000-0000000000e1') = 'rifiutata'
  and (select motivo_perdita = 'prezzo' and esito = 'persa' from public.opportunities where party_id = pg_temp.id('m4'))
  and pg_temp.offer('m5', '00000000-0000-4000-8000-0000000000e1') = 'accettata'
  and pg_temp.offer('m6', '00000000-0000-4000-8000-0000000000e1') = 'inviata'
  and pg_temp.offer('m6', '00000000-0000-4000-8000-0000000000e2') = 'da_inviare'
  and pg_temp.offer('m7', '00000000-0000-4000-8000-0000000000e1') = '-'
);
select pg_temp.record(
  'mappatura: il prossimo promemoria aperto diventa la data promemoria (giorno di Roma)',
  (select promemoria_il = '2026-10-22' from public.opportunities where party_id = pg_temp.id('m6') and parking_id = '00000000-0000-4000-8000-0000000000e1')
);
select pg_temp.record(
  'mappatura: conteggi restituiti per stato prospect e stato offerta',
  pg_temp.j('map') -> 'prospect' = '{"da_contattare": 3, "interessato": 4, "non_interessato": 1}'::jsonb
  and pg_temp.j('map') -> 'pipeline' = '{"da_inviare": 2, "inviata": 1, "accettata": 1, "rifiutata": 1}'::jsonb
  and (pg_temp.j('map') ->> 'promemoria')::int = 1,
  pg_temp.j('map')::text
);
select pg_temp.record(
  'mappatura: non richiamabile dall''API',
  not has_function_privilege('authenticated', 'public.map_prospect_status(uuid[])', 'execute')
  and not has_function_privilege('anon', 'public.map_prospect_status(uuid[])', 'execute')
);

-- ---------------------------------------------------------------------------
-- Entry and exit of the pipeline
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));
select * from public.add_to_parking(array[pg_temp.id('p1')], '00000000-0000-4000-8000-0000000000e1');
select * from public.add_to_parking(array[pg_temp.id('p1')], '00000000-0000-4000-8000-0000000000e2');

select pg_temp.record(
  'nuovo prospect: Da contattare, fuori dalla pipeline',
  (select stato_prospect = 'da_contattare' from public.parties where id = pg_temp.id('p1'))
  and pg_temp.offer('p1', '00000000-0000-4000-8000-0000000000e1') = '-'
);

insert into test_json select 's1', public.set_prospect_status(pg_temp.id('p1'), 'interessato');
select pg_temp.record(
  'Interessato: ogni coppia prospect + parcheggio entra in pipeline con "Offerta da inviare"',
  pg_temp.j('s1') ->> 'entrate' = '2'
  and pg_temp.offer('p1', '00000000-0000-4000-8000-0000000000e1') = 'da_inviare'
  and pg_temp.offer('p1', '00000000-0000-4000-8000-0000000000e2') = 'da_inviare'
  and (select bool_and(fase = 'interessata' and esito = 'aperta') from public.opportunities where party_id = pg_temp.id('p1'))
);

insert into test_json select 's2', public.set_prospect_status(pg_temp.id('p1'), 'molto_interessato');
select pg_temp.record(
  'Molto interessato dopo Interessato: nessun duplicato in pipeline',
  pg_temp.j('s2') ->> 'entrate' = '0'
  and (select count(*) from public.opportunities where party_id = pg_temp.id('p1') and stato_offerta is not null) = 2
);
select pg_temp.expect_error(
  'una sola riga di pipeline per coppia (indice univoco)',
  format($$insert into public.opportunities (party_id, parking_id, esito, motivo_perdita, stato_offerta)
           values (%L, '00000000-0000-4000-8000-0000000000e1', 'persa', 'prezzo', 'rifiutata')$$, pg_temp.id('p1')),
  '23505'
);

select * from public.add_to_parking(array[pg_temp.id('p1')], '00000000-0000-4000-8000-0000000000e3');
select pg_temp.record(
  'parcheggio aggiunto a un prospect interessato: entra subito in pipeline',
  pg_temp.offer('p1', '00000000-0000-4000-8000-0000000000e3') = 'da_inviare'
);

select public.set_offer_status(
  (select id from public.opportunities where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e1'), 'inviata');
select pg_temp.record(
  'Offerta inviata: fase Offerta inviata, opportunità aperta',
  (select fase = 'offerta_inviata' and esito = 'aperta' from public.opportunities
   where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e1')
);

insert into test_json select 's3', public.set_prospect_status(pg_temp.id('p1'), 'da_contattare');
select pg_temp.record(
  'di nuovo Da contattare: escono le righe "da inviare", resta quella con offerta inviata',
  pg_temp.j('s3') ->> 'uscite' = '2'
  and pg_temp.offer('p1', '00000000-0000-4000-8000-0000000000e1') = 'inviata'
  and pg_temp.offer('p1', '00000000-0000-4000-8000-0000000000e2') = '-'
  and pg_temp.offer('p1', '00000000-0000-4000-8000-0000000000e3') = '-'
);

select public.set_prospect_status(pg_temp.id('p1'), 'interessato');
insert into test_json select 's4', public.set_prospect_status(pg_temp.id('p1'), 'non_interessato', 'prezzo');
select pg_temp.record(
  'Non interessato: motivo facoltativo salvato, escono le righe da inviare, chiude le opportunità aperte',
  (select stato_prospect = 'non_interessato' and motivo_non_interesse = 'prezzo' from public.parties where id = pg_temp.id('p1'))
  and pg_temp.j('s4') ->> 'uscite' = '2' and pg_temp.j('s4') ->> 'chiuse' = '2'
  and (select esito = 'persa' and motivo_perdita = 'prezzo' from public.opportunities
       where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e2')
);
select pg_temp.record(
  'Non interessato con offerta inviata: diventa Rifiutata con il motivo scelto, nello storico e nell''audit con autore',
  pg_temp.j('s4') ->> 'rifiutate' = '1'
  and pg_temp.offer('p1', '00000000-0000-4000-8000-0000000000e1') = 'rifiutata'
  and (select esito = 'persa' and motivo_perdita = 'prezzo' from public.opportunities
       where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e1')
  and exists (select 1 from public.activities a join public.opportunities o on o.id = a.opportunity_id
              where o.party_id = pg_temp.id('p1') and o.parking_id = '00000000-0000-4000-8000-0000000000e1'
                and a.tipo = 'cambio_fase' and a.testo = 'Chiusa come persa: prezzo' and a.user_id = pg_temp.id('operatore'))
  and exists (select 1 from public.audit_logs a join public.opportunities o on o.id = a.entita_id
              where o.party_id = pg_temp.id('p1') and o.parking_id = '00000000-0000-4000-8000-0000000000e1'
                and a.prima ->> 'stato_offerta' = 'inviata' and a.dopo ->> 'stato_offerta' = 'rifiutata' and a.utente_id = pg_temp.id('operatore'))
);
select public.set_prospect_status(pg_temp.id('p1'), 'non_interessato');
select pg_temp.record(
  'Non interessato senza motivo: nessun motivo sul prospect',
  (select motivo_non_interesse is null from public.parties where id = pg_temp.id('p1'))
);

insert into test_json select 's5', public.set_prospect_status(pg_temp.id('p1'), 'interessato');
select pg_temp.record(
  'di nuovo Interessato: le coppie uscite rientrano come "Offerta da inviare", la Rifiutata resta rifiutata, senza duplicati',
  pg_temp.j('s5') ->> 'entrate' = '2'
  and pg_temp.offer('p1', '00000000-0000-4000-8000-0000000000e2') = 'da_inviare'
  and (select esito = 'aperta' and motivo_perdita is null from public.opportunities
       where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e2')
  and pg_temp.offer('p1', '00000000-0000-4000-8000-0000000000e1') = 'rifiutata'
  and (select count(*) from public.opportunities where party_id = pg_temp.id('p1') and stato_offerta is not null) = 3
);
select public.set_offer_status(
  (select id from public.opportunities where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e1'), 'da_inviare');
select pg_temp.record(
  'la Rifiutata si rimette a mano su "Offerta da inviare" (riaperta)',
  (select stato_offerta = 'da_inviare' and esito = 'aperta' and motivo_perdita is null from public.opportunities
   where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e1')
);
select public.set_offer_status(
  (select id from public.opportunities where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e1'), 'inviata');

-- ---------------------------------------------------------------------------
-- Offer status
-- ---------------------------------------------------------------------------

select public.set_offer_status(
  (select id from public.opportunities where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e2'), 'rifiutata');
select pg_temp.record(
  'Rifiutata senza motivo: persa con "motivo non indicato"',
  (select esito = 'persa' and motivo_perdita = 'non_indicato' and public.loss_reason_label(motivo_perdita) = 'motivo non indicato'
   from public.opportunities where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e2')
);
select public.set_offer_status(
  (select id from public.opportunities where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e2'), 'rifiutata', 'altro');
select pg_temp.record(
  'Rifiutata con motivo "altro": nessuna nota obbligatoria',
  (select motivo_perdita = 'altro' from public.opportunities where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e2')
);
select public.set_offer_status(
  (select id from public.opportunities where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e3'), 'accettata');
select pg_temp.record(
  'Accettata: opportunità vinta',
  (select esito = 'vinta' and fase = 'vinta' from public.opportunities where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e3')
);
select pg_temp.expect_error(
  'Non interessato con un''offerta accettata: bloccato, con il parcheggio nel messaggio',
  format($$select public.set_prospect_status(%L, 'non_interessato', 'prezzo')$$, pg_temp.id('p1')),
  '23514'
);
do $$
declare v_detail text;
begin
  begin
    perform public.set_prospect_status(pg_temp.id('p1'), 'non_interessato');
  exception when sqlstate '23514' then
    get stacked diagnostics v_detail = pg_exception_detail;
  end;
  perform pg_temp.record(
    'offerta accettata: nessuna modifica parziale (stato, righe e motivi invariati)',
    v_detail = 'Prospect Tre'
    and (select stato_prospect = 'interessato' and motivo_non_interesse is null from public.parties where id = pg_temp.id('p1'))
    and pg_temp.offer('p1', '00000000-0000-4000-8000-0000000000e1') = 'inviata'
    and pg_temp.offer('p1', '00000000-0000-4000-8000-0000000000e2') = 'rifiutata'
    and pg_temp.offer('p1', '00000000-0000-4000-8000-0000000000e3') = 'accettata',
    v_detail
  );
end $$;
select pg_temp.expect_error(
  'stato offerta solo su righe della pipeline',
  format($$select public.set_offer_status((select id from public.opportunities where party_id = %L), 'inviata')$$, pg_temp.id('m1')),
  'P0002'
);
select pg_temp.record(
  'storico: i cambi di stato offerta diventano cambi di fase con autore',
  exists (select 1 from public.activities where party_id = pg_temp.id('p1') and tipo = 'cambio_fase'
          and user_id = pg_temp.id('operatore') and testo = 'Chiusa come vinta')
);

-- ---------------------------------------------------------------------------
-- Reminders (Europe/Rome)
-- ---------------------------------------------------------------------------

select pg_temp.record(
  'giorno di Roma: 22:30 UTC del 22/10 è già il 23 (ora legale), 22:30 UTC del 25/10 è ancora il 25 (ora solare)',
  public.rome_day('2026-10-22 22:30:00+00') = '2026-10-23'
  and public.rome_day('2026-10-22 21:59:00+00') = '2026-10-22'
  and public.rome_day('2026-10-25 22:30:00+00') = '2026-10-25'
  and public.rome_day('2026-10-25 23:30:00+00') = '2026-10-26'
  and public.rome_today() = (now() at time zone 'Europe/Rome')::date
);

update public.opportunities set promemoria_il = public.rome_today() - 2, note = 'Richiamare il titolare'
where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e1';
update public.opportunities set promemoria_il = public.rome_today()
where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e2';
update public.opportunities set promemoria_il = public.rome_today() + 5
where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e3';

create temp table rows_promemoria as
select * from public.pipeline_rows(p_promemoria => 'con', p_ordina => 'promemoria', p_nome => 'Azienda Esempio Prospect');
grant all on rows_promemoria to authenticated;
select pg_temp.record(
  'promemoria: giorni da oggi (Roma), scaduti in alto',
  (select string_agg(giorni::text, ',' order by n) from (select giorni, row_number() over () n from rows_promemoria) x) = '-2,0,5'
  and (select note from rows_promemoria where giorni = -2) = 'Richiamare il titolare'
);
select pg_temp.record(
  'promemoria: filtri scaduti / entro 3 giorni (oggi compreso) / oltre',
  (select count(*) from public.pipeline_rows(p_promemoria => 'scaduti', p_nome => 'Azienda Esempio Prospect')) = 1
  and (select count(*) from public.pipeline_rows(p_promemoria => 'entro3', p_nome => 'Azienda Esempio Prospect')) = 1
  and (select count(*) from public.pipeline_rows(p_promemoria => 'oltre3', p_nome => 'Azienda Esempio Prospect')) = 1
);
select pg_temp.record(
  'contatore degli scaduti: conta i promemoria prima di oggi dei lead attivi',
  public.count_overdue_reminders() >= 1
  and public.count_overdue_reminders() = (select count(*) from public.opportunities o join public.parties p on p.id = o.party_id
                                          where o.promemoria_il < public.rome_today() and o.stato_offerta in ('da_inviare', 'inviata')
                                            and p.merged_into_id is null)
);
update public.opportunities set promemoria_il = null
where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e1';
select pg_temp.record(
  'promemoria fatto (data svuotata): non è più in Promemoria',
  (select count(*) from public.pipeline_rows(p_promemoria => 'con', p_nome => 'Azienda Esempio Prospect')) = 2
);
select pg_temp.expect_error(
  'promemoria solo sulle righe della pipeline',
  format($$update public.opportunities set promemoria_il = current_date where party_id = %L$$, pg_temp.id('m1')),
  '23514'
);
select public.set_prospect_status(pg_temp.id('p2'), 'interessato');
select * from public.add_to_parking(array[pg_temp.id('p2')], '00000000-0000-4000-8000-0000000000e1');
update public.opportunities set promemoria_il = public.rome_today() + 1 where party_id = pg_temp.id('p2');
select public.set_prospect_status(pg_temp.id('p2'), 'da_contattare');
select pg_temp.record(
  'uscita dalla pipeline: il promemoria si svuota',
  (select stato_offerta is null and promemoria_il is null from public.opportunities where party_id = pg_temp.id('p2'))
);

-- ---------------------------------------------------------------------------
-- Inline edits and the audit
-- ---------------------------------------------------------------------------

update public.parties set ultimo_contatto_il = public.rome_today() - 2, categoria = 'Hotel' where id = pg_temp.id('p1');
select public.save_notes('parties', pg_temp.id('p1'), 'Nota dalla tabella');
update public.opportunities set responsabile_id = pg_temp.id('admin')
where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e3';
select pg_temp.record(
  'modifica in linea: data ultimo contatto, categoria e note in audit con autore',
  exists (select 1 from public.audit_logs where entita = 'parties' and entita_id = pg_temp.id('p1') and utente_id = pg_temp.id('operatore')
          and dopo ->> 'ultimo_contatto_il' = (public.rome_today() - 2)::text and prima ->> 'ultimo_contatto_il' is null and dopo ->> 'categoria' = 'Hotel')
  and exists (select 1 from public.audit_logs where entita = 'parties' and entita_id = pg_temp.id('p1') and utente_id = pg_temp.id('operatore')
              and dopo ->> 'note' = 'Nota dalla tabella')
);
select pg_temp.record(
  'modifica in linea: stato prospect, stato offerta e responsabile in audit con autore',
  exists (select 1 from public.audit_logs where entita = 'parties' and entita_id = pg_temp.id('p1') and utente_id = pg_temp.id('operatore')
          and prima ->> 'stato_prospect' = 'da_contattare' and dopo ->> 'stato_prospect' = 'interessato')
  and exists (select 1 from public.audit_logs a join public.opportunities o on o.id = a.entita_id
              where a.entita = 'opportunities' and o.party_id = pg_temp.id('p1') and a.utente_id = pg_temp.id('operatore')
                and a.dopo ->> 'stato_offerta' = 'inviata')
  and exists (select 1 from public.audit_logs where entita = 'opportunities' and utente_id = pg_temp.id('operatore')
              and dopo ->> 'responsabile_id' = pg_temp.id('admin')::text)
);

select public.save_primary_contact(pg_temp.id('p1'), 'telefono', '02 9999 0000');
select public.save_primary_contact(pg_temp.id('p1'), 'referente', 'Maria Luisa Esempi');
select pg_temp.record(
  'telefono e referente in tabella: scritti sul contatto principale (il primo creato), in audit con autore',
  (select telefono = '+390299990000' and nome = 'Maria' and cognome = 'Luisa Esempi' from public.contacts where id = pg_temp.id('c1'))
  and public.primary_contact(pg_temp.id('p1')) = pg_temp.id('c1')
  and exists (select 1 from public.audit_logs where entita = 'contacts' and entita_id = pg_temp.id('c1') and utente_id = pg_temp.id('operatore')
              and prima ->> 'telefono' = '+390233334444' and dopo ->> 'telefono' = '+390299990000')
);
insert into test_json select 'pc', to_jsonb(public.save_primary_contact(pg_temp.id('p2'), 'email', 'studio@senza-contatti.example'));
select pg_temp.record(
  'senza contatti: la prima modifica crea il contatto principale; telefono del prospect mostrato finché il contatto non ne ha uno',
  (select party_id = pg_temp.id('p2') and email = 'studio@senza-contatti.example' from public.contacts where id = (pg_temp.j('pc') #>> '{}')::uuid)
  and (select telefono = '+390655556666' and email = 'studio@senza-contatti.example' and contatto_id = (pg_temp.j('pc') #>> '{}')::uuid
       from public.prospect_rows(p_nome => 'Studio Esempio Senza Contatti'))
);
select pg_temp.record(
  'senza contatti e valore vuoto: nessun contatto creato',
  public.save_primary_contact(pg_temp.id('p3'), 'telefono', '  ') is null
  and not exists (select 1 from public.contacts where party_id = pg_temp.id('p3'))
);

-- ---------------------------------------------------------------------------
-- Car parks of a prospect
-- ---------------------------------------------------------------------------

select pg_temp.expect_error(
  'togli parcheggio: rifiutato se l''offerta è già stata inviata',
  format($$select public.remove_parking_from_prospect(%L, '00000000-0000-4000-8000-0000000000e1')$$, pg_temp.id('p1')),
  '23514'
);
select * from public.add_to_parking(array[pg_temp.id('p3')], '00000000-0000-4000-8000-0000000000e2');
insert into test_json select 'rm', to_jsonb(public.remove_parking_from_prospect(pg_temp.id('p3'), '00000000-0000-4000-8000-0000000000e2'));
select pg_temp.record(
  'togli parcheggio: l''operatore lo toglie se non c''è offerta inviata; in audit',
  pg_temp.j('rm') = '1'::jsonb
  and not exists (select 1 from public.opportunities where party_id = pg_temp.id('p3'))
  and exists (select 1 from public.audit_logs where entita = 'opportunities' and azione = 'delete' and utente_id = pg_temp.id('operatore')
              and prima ->> 'party_id' = pg_temp.id('p3')::text)
);

-- ---------------------------------------------------------------------------
-- Email pop-up: permission and suppression list
-- ---------------------------------------------------------------------------

insert into test_json select 'e0', public.email_eligibility(pg_temp.id('p1'), pg_temp.id('c1'));
select pg_temp.record(
  'pop-up email: senza permesso non ammessa, unico controllo mancante il permesso',
  (pg_temp.j('e0') ->> 'ammessa')::boolean = false
  and (select array_agg(x ->> 'codice') from jsonb_array_elements(pg_temp.j('e0') -> 'controlli') x where not (x ->> 'ok')::boolean) = array['permesso']
);
select public.register_email_permission(pg_temp.id('c1'), null, 'contatto_in_entrata');
insert into test_json select 'e1', public.email_eligibility(pg_temp.id('p1'), pg_temp.id('c1'));
select pg_temp.record(
  'pop-up email: "Ha scritto per primo" registra il permesso con autore e l''email diventa ammessa',
  (pg_temp.j('e1') ->> 'ammessa')::boolean
  and exists (select 1 from public.contact_permissions where contact_id = pg_temp.id('c1') and base = 'contatto_in_entrata'
              and stato = 'attivo' and created_by = pg_temp.id('operatore'))
);
select public.register_email_permission(null, pg_temp.id('p3'), 'richiesta_in_chiamata');
reset role;
select public.add_suppression('email', 'officina@esclusa-esempio.example', 'Opposizione', 'email');
select pg_temp.act_as(pg_temp.id('operatore'));
insert into test_json select 'e2', public.email_eligibility(pg_temp.id('p3'), null);
select pg_temp.record(
  'lista di esclusione ancora bloccante anche con il permesso registrato',
  (pg_temp.j('e2') ->> 'ammessa')::boolean = false
  and exists (select 1 from jsonb_array_elements(pg_temp.j('e2') -> 'controlli') x where x ->> 'codice' = 'esclusione' and not (x ->> 'ok')::boolean)
);
select public.mark_do_not_contact('parties', pg_temp.id('p2'), 'Non vuole essere contattato', 'telefono');
select pg_temp.record(
  '"Non contattare" ancora bloccante; testo con "prospect"',
  (public.email_eligibility(pg_temp.id('p2'), null) ->> 'ammessa')::boolean = false
  and exists (select 1 from jsonb_array_elements(public.email_eligibility(pg_temp.id('p2'), null) -> 'controlli') x
              where x ->> 'codice' = 'non_contattare' and x ->> 'testo' like '%prospect%')
);

-- ---------------------------------------------------------------------------
-- List reads
-- ---------------------------------------------------------------------------

select pg_temp.record(
  'Prospect: filtri per stato, parcheggio, categoria, telefono (solo cifre), referente; totale',
  (select count(*) from public.prospect_rows(p_stati => array['interessato']::public.prospect_status[], p_nome => 'Azienda Esempio Prospect')) = 1
  and (select count(*) from public.prospect_rows(p_parcheggio => '00000000-0000-4000-8000-0000000000e3', p_nome => 'esempio')) = 1
  and (select count(*) from public.prospect_rows(p_categoria => 'Hotel', p_nome => 'Azienda Esempio Prospect')) = 1
  and (select count(*) from public.prospect_rows(p_telefono => '029999', p_nome => 'esempio')) = 1
  and (select count(*) from public.prospect_rows(p_referente => 'luisa')) >= 1
  and (select totale from public.prospect_rows(p_nome => 'Azienda Esempio Mappatura', p_limit => 2) limit 1) = 8
  and (select count(*) from public.prospect_rows(p_nome => 'Azienda Esempio Mappatura', p_limit => 2)) = 2
);
select pg_temp.record(
  'Prospect: parcheggi in ordine con lo stato offerta; ordinamento per stato e decrescente',
  (select string_agg(x ->> 'nome', ',') from public.prospect_rows(p_nome => 'Azienda Esempio Prospect') r, jsonb_array_elements(r.parcheggi) x)
    = 'Prospect Due,Prospect Tre,Prospect Uno'
  and (select string_agg(stato::text, ',') from public.prospect_rows(p_nome => 'Azienda Esempio Mappatura M', p_ordina => 'stato', p_desc => true))
    = 'non_interessato,interessato,interessato,interessato,interessato,da_contattare,da_contattare,da_contattare'
);
select pg_temp.record(
  'Prospect: ultimo contatto mai / ultima settimana; filtro testo con caratteri jolly trattati come testo',
  (select count(*) from public.prospect_rows(p_ultimo_contatto => 'mai', p_nome => 'Azienda Esempio Prospect')) = 0
  and (select count(*) from public.prospect_rows(p_ultimo_contatto => 'mese', p_nome => 'Azienda Esempio Prospect')) = 1
  and (select count(*) from public.prospect_rows(p_nome => '100%_')) = 0
);
select pg_temp.record(
  'Pipeline: solo le coppie in pipeline, una riga ciascuna, filtri per stato offerta e responsabile',
  (select count(*) from public.pipeline_rows(p_nome => 'Azienda Esempio Prospect')) = 3
  and (select count(*) from public.pipeline_rows(p_nome => 'Azienda Esempio Mappatura')) = 5
  and (select count(*) from public.pipeline_rows(p_stati => array['rifiutata']::public.pipeline_offer_status[], p_nome => 'Esempio')) = 2
  and (select count(*) from public.pipeline_rows(p_responsabile => pg_temp.id('admin'), p_nome => 'Esempio')) = 1
  and (select motivo_rifiuto from public.pipeline_rows(p_nome => 'Azienda Esempio Mappatura M4')) = 'prezzo'
);
reset role;

-- ---------------------------------------------------------------------------
-- More contact persons: one main contact, row contact in the pipeline
-- ---------------------------------------------------------------------------

insert into test_ids select 'c2', id from public.contacts where party_id = pg_temp.id('p1') and nome = 'Secondo';
select pg_temp.record(
  'principale: uno solo per prospect (il primo creato), il nuovo contatto non lo diventa',
  (select count(*) from public.contacts where party_id = pg_temp.id('p1') and principale) = 1
  and (select principale from public.contacts where id = pg_temp.id('c1'))
  and not (select principale from public.contacts where id = pg_temp.id('c2'))
);
insert into public.contacts (party_id, nome, principale) values (pg_temp.id('p1'), 'Terzo', true);
select pg_temp.record(
  'principale: un contatto aggiunto come principale non toglie il posto a quello esistente',
  (select count(*) from public.contacts where party_id = pg_temp.id('p1') and principale) = 1
  and (select principale from public.contacts where id = pg_temp.id('c1'))
);
select pg_temp.expect_error(
  'principale: due principali rifiutati anche con un update diretto',
  format('update public.contacts set principale = true where id = %L', pg_temp.id('c2')),
  '23505'
);
select public.set_primary_contact(pg_temp.id('c2'));
select pg_temp.record(
  'Rendi principale: cambia il principale, tabella Prospect con email e referente del nuovo, in audit con autore',
  (select count(*) from public.contacts where party_id = pg_temp.id('p1') and principale) = 1
  and (select principale from public.contacts where id = pg_temp.id('c2'))
  and (select referente = 'Secondo' and email = 'secondo@prospect-esempio.example' and contatto_id = pg_temp.id('c2') and altri_contatti = 2
       from public.prospect_rows(p_nome => 'Azienda Esempio Prospect'))
  and exists (select 1 from public.audit_logs where entita = 'contacts' and entita_id = pg_temp.id('c2') and utente_id = pg_temp.id('operatore')
              and prima ->> 'principale' = 'false' and dopo ->> 'principale' = 'true')
);
update public.opportunities set contact_id = pg_temp.id('c1')
where party_id = pg_temp.id('p1') and parking_id = '00000000-0000-4000-8000-0000000000e1';
select pg_temp.record(
  'Pipeline: referente per riga (contatto dell''opportunità), altrimenti il principale; menu con i contatti del prospect',
  (select referente = 'Maria Luisa Esempi' and contatto_id = pg_temp.id('c1') and telefono = '+390299990000'
   from public.pipeline_rows(p_nome => 'Azienda Esempio Prospect', p_parcheggio => '00000000-0000-4000-8000-0000000000e1'))
  and (select referente = 'Secondo' and contatto_id = pg_temp.id('c2')
       from public.pipeline_rows(p_nome => 'Azienda Esempio Prospect', p_parcheggio => '00000000-0000-4000-8000-0000000000e3'))
  and (select jsonb_array_length(contatti) = 3 and (contatti -> 0 ->> 'id')::uuid = pg_temp.id('c2')
       from public.pipeline_rows(p_nome => 'Azienda Esempio Prospect', p_parcheggio => '00000000-0000-4000-8000-0000000000e3'))
);
select public.save_contact_field(pg_temp.id('c1'), 'email', 'riga@prospect-esempio.example');
select pg_temp.record(
  'Pipeline: email modificata sul contatto della riga, non sul principale',
  (select email = 'riga@prospect-esempio.example' from public.contacts where id = pg_temp.id('c1'))
  and (select email = 'secondo@prospect-esempio.example' from public.contacts where id = pg_temp.id('c2'))
);
reset role;
delete from public.contacts where id = pg_temp.id('c2');
select pg_temp.record(
  'principale eliminato: il contatto più vecchio rimasto diventa principale',
  (select principale from public.contacts where id = pg_temp.id('c1'))
  and (select count(*) from public.contacts where party_id = pg_temp.id('p1') and principale) = 1
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

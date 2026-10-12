-- Row level security and constraint tests.
--
-- Run against a database where all migrations are applied, connected as the
-- database owner (postgres), with psql:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_and_constraints.sql
--
-- Everything runs in one transaction that ends with ROLLBACK: no test data is
-- left behind. Only fake example.com addresses are used; the users email
-- domain constraint is dropped inside the transaction so they can be inserted,
-- and comes back with the rollback.
-- Output: one line per test, PASS or FAIL. Exits with an error if any test fails.

\set ON_ERROR_STOP 1
\set QUIET on
\pset tuples_only on
\pset format unaligned

begin;

-- ---------------------------------------------------------------------------
-- Harness
-- ---------------------------------------------------------------------------

create temp table test_results (
  n serial primary key,
  name text not null,
  ok boolean not null,
  detail text
);
grant all on test_results to anon, authenticated;
grant all on sequence test_results_n_seq to anon, authenticated;

-- Shared ids, readable from every role.
create temp table test_ids (key text primary key, id uuid not null);
grant select, insert on test_ids to anon, authenticated;

create function pg_temp.id(k text) returns uuid language sql stable as $$
  select id from test_ids where key = k
$$;

create function pg_temp.record(name text, ok boolean, detail text default null)
returns void language sql as $$
  insert into test_results (name, ok, detail) values (name, ok, detail)
$$;

-- Runs a statement that must fail; passes when it raises the given SQLSTATE
-- (any error when expected_state is null).
create function pg_temp.expect_error(name text, stmt text, expected_state text default null)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    perform pg_temp.record(
      name,
      expected_state is null or sqlstate = expected_state,
      'errore ' || sqlstate || ': ' || sqlerrm
    );
    return;
  end;
  perform pg_temp.record(name, false, 'nessun errore');
end;
$$;

-- Acts as an authenticated API user (or anon when uid is null).
create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  if uid is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', uid, 'role', 'authenticated')::text,
      true
    );
    perform set_config('role', 'authenticated', true);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as database owner)
-- ---------------------------------------------------------------------------

alter table public.users drop constraint users_email_domain;

insert into public.users (email, nome, ruolo, attivo) values
  ('test-admin@example.com', 'Admin Di Prova', 'admin', true),
  ('test-operatore@example.com', 'Operatore Di Prova', 'operatore', true),
  ('test-disattivato@example.com', 'Utente Disattivato', 'operatore', false);

-- Sign-ins: the link trigger must give the CRM rows the auth ids.
insert into auth.users (id, email) values
  (gen_random_uuid(), 'TEST-ADMIN@example.com'),
  (gen_random_uuid(), 'test-operatore@example.com'),
  (gen_random_uuid(), 'test-disattivato@example.com'),
  (gen_random_uuid(), 'test-esterno@example.com');

insert into test_ids (key, id)
select replace(split_part(lower(email), '@', 1), 'test-', ''), id
from auth.users
where lower(email) in (
  'test-admin@example.com',
  'test-operatore@example.com',
  'test-disattivato@example.com',
  'test-esterno@example.com'
);

select pg_temp.record(
  'login: account abilitato collegato ad auth.users (email in minuscolo)',
  (select count(*) from public.users u join test_ids t on t.id = u.id
   where t.key in ('admin', 'operatore')) = 2
);
select pg_temp.record(
  'login: account disattivato o fuori elenco non collegato',
  not exists (select 1 from public.users where id in (pg_temp.id('disattivato'), pg_temp.id('esterno')))
);

insert into public.parking_facilities (id, nome, tipo, indirizzo, lat, lng)
values (gen_random_uuid(), 'Parcheggio Esempio', 'autorimessa', 'Via Esempio 1', 45.4642, 9.19);
insert into test_ids select 'parking', id from public.parking_facilities where nome = 'Parcheggio Esempio';

insert into public.parking_products (parking_id, nome, tipo, periodo, prezzo_netto, iva_pct)
values (pg_temp.id('parking'), 'Abbonamento Esempio', 'abbonamento', 'mese', 100.00, 22.00);
insert into test_ids select 'product', id from public.parking_products where nome = 'Abbonamento Esempio';

insert into public.parties (tipo, denominazione, piva)
values ('azienda', 'Azienda Esempio Srl', '00000000001');
insert into test_ids select 'party_fixture', id from public.parties where denominazione = 'Azienda Esempio Srl';

-- ---------------------------------------------------------------------------
-- Anonymous
-- ---------------------------------------------------------------------------

select pg_temp.act_as(null);

select pg_temp.record(
  'anonimo: nessuna lettura',
  (select count(*) from public.parties)
  + (select count(*) from public.parking_facilities)
  + (select count(*) from public.parking_products)
  + (select count(*) from public.users)
  + (select count(*) from public.audit_logs) = 0
);
select pg_temp.expect_error(
  'anonimo: nessuna scrittura',
  $$insert into public.parties (tipo, denominazione) values ('azienda', 'Azienda Anonima Esempio')$$,
  '42501'
);

reset role;

-- ---------------------------------------------------------------------------
-- Not enabled accounts
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('esterno'));
select pg_temp.record(
  'account fuori elenco: nessuna lettura',
  (select count(*) from public.parties) + (select count(*) from public.users) = 0
);
reset role;

select pg_temp.act_as(pg_temp.id('disattivato'));
select pg_temp.record(
  'account disattivato: nessuna lettura',
  (select count(*) from public.parties) + (select count(*) from public.users) = 0
);
reset role;

-- ---------------------------------------------------------------------------
-- Operator
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));

select pg_temp.record(
  'operatore: legge soggetti, parcheggi e prodotti',
  (select count(*) from public.parties) >= 1
  and (select count(*) from public.parking_facilities) >= 1
  and (select count(*) from public.parking_products) >= 1
);

do $$
declare
  new_party uuid;
  new_opportunity uuid;
begin
  insert into public.parties (tipo, denominazione)
  values ('azienda', 'Studio Esempio Snc')
  returning id into new_party;

  insert into public.opportunities (party_id, parking_id, responsabile_id)
  values (new_party, pg_temp.id('parking'), auth.uid())
  returning id into new_opportunity;

  insert into test_ids values ('party', new_party), ('opportunity', new_opportunity);

  perform pg_temp.record(
    'operatore: crea un soggetto e un''opportunità',
    (select created_by from public.parties where id = new_party) = auth.uid()
  );
exception when others then
  perform pg_temp.record('operatore: crea un soggetto e un''opportunità', false, sqlstate || ': ' || sqlerrm);
end;
$$;

select pg_temp.expect_error(
  'operatore: non modifica i prezzi',
  format('update public.parking_products set prezzo_netto = 1 where id = %L', pg_temp.id('product')),
  '42501'
);
select pg_temp.expect_error(
  'operatore: non crea prodotti con prezzo',
  format(
    $$insert into public.parking_products (parking_id, nome, tipo, prezzo_netto) values (%L, 'Prodotto Esempio', 'carnet', 5)$$,
    pg_temp.id('parking')
  ),
  '42501'
);

do $$
declare
  changed int;
begin
  update public.parking_products set note = 'Nota di prova' where id = pg_temp.id('product');
  get diagnostics changed = row_count;
  perform pg_temp.record('operatore: modifica un prodotto senza toccare i prezzi', changed = 1);
end;
$$;

do $$
declare
  deleted int;
begin
  delete from public.parties where id = pg_temp.id('party_fixture');
  get diagnostics deleted = row_count;
  perform pg_temp.record(
    'operatore: non cancella',
    deleted = 0 and exists (select 1 from public.parties where id = pg_temp.id('party_fixture')),
    deleted || ' righe cancellate'
  );
end;
$$;

select pg_temp.expect_error(
  'operatore: non inserisce in users',
  $$insert into public.users (email, ruolo) values ('test-nuovo@example.com', 'admin')$$,
  '42501'
);

do $$
declare
  changed int;
begin
  update public.users set ruolo = 'admin' where id = auth.uid();
  get diagnostics changed = row_count;
  perform pg_temp.record('operatore: non modifica users', changed = 0, changed || ' righe modificate');
end;
$$;

select pg_temp.expect_error(
  'operatore: non scrive su data_sources',
  $$insert into public.data_sources (nome) values ('Fonte Esempio')$$,
  '42501'
);

-- Audit: an update to an opportunity writes one audit row with author and values.
do $$
declare
  before_count int;
  after_count int;
  log_row public.audit_logs;
begin
  select count(*) into before_count from public.audit_logs
  where entita = 'opportunities' and entita_id = pg_temp.id('opportunity') and azione = 'update';

  update public.opportunities set fase = 'da_contattare' where id = pg_temp.id('opportunity');

  select count(*) into after_count from public.audit_logs
  where entita = 'opportunities' and entita_id = pg_temp.id('opportunity') and azione = 'update';

  select * into log_row from public.audit_logs
  where entita = 'opportunities' and entita_id = pg_temp.id('opportunity') and azione = 'update'
  order by quando desc limit 1;

  perform pg_temp.record(
    'una modifica a un''opportunità genera una riga in audit_logs',
    after_count = before_count + 1
    and log_row.utente_id = auth.uid()
    and log_row.prima ->> 'fase' = 'individuata'
    and log_row.dopo ->> 'fase' = 'da_contattare'
  );
end;
$$;

select pg_temp.expect_error(
  'seconda opportunità aperta sulla stessa coppia: rifiutata',
  format(
    'insert into public.opportunities (party_id, parking_id) values (%L, %L)',
    pg_temp.id('party'), pg_temp.id('parking')
  ),
  '23505'
);

select pg_temp.expect_error(
  'P.IVA duplicata: rifiutata',
  $$insert into public.parties (tipo, denominazione, piva) values ('azienda', 'Altra Azienda Esempio Srl', '00000000001')$$,
  '23505'
);

select pg_temp.expect_error(
  'opportunità persa senza motivo: rifiutata',
  format($$update public.opportunities set esito = 'persa' where id = %L$$, pg_temp.id('opportunity')),
  '23514'
);

-- Closing the open opportunity frees the pair for a new one.
do $$
begin
  update public.opportunities set esito = 'persa', motivo_perdita = 'prezzo'
  where id = pg_temp.id('opportunity');
  insert into public.opportunities (party_id, parking_id) values (pg_temp.id('party'), pg_temp.id('parking'));
  perform pg_temp.record('nuova opportunità sulla stessa coppia dopo la chiusura: ammessa', true);
exception when others then
  perform pg_temp.record('nuova opportunità sulla stessa coppia dopo la chiusura: ammessa', false, sqlstate || ': ' || sqlerrm);
end;
$$;

select pg_temp.expect_error(
  'update su audit_logs da operatore: rifiutato',
  'update public.audit_logs set azione = ''delete''',
  '42501'
);

reset role;

-- ---------------------------------------------------------------------------
-- Administrator
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('admin'));

do $$
declare
  changed int;
begin
  update public.parking_products set prezzo_netto = 120.00, iva_pct = 22.00 where id = pg_temp.id('product');
  get diagnostics changed = row_count;
  perform pg_temp.record(
    'admin: modifica i prezzi',
    changed = 1 and (select prezzo_netto from public.parking_products where id = pg_temp.id('product')) = 120.00
  );
exception when others then
  perform pg_temp.record('admin: modifica i prezzi', false, sqlstate || ': ' || sqlerrm);
end;
$$;

select pg_temp.expect_error(
  'update su audit_logs da admin: rifiutato',
  'update public.audit_logs set azione = ''delete''',
  '42501'
);
select pg_temp.expect_error(
  'delete su audit_logs da admin: rifiutato',
  'delete from public.audit_logs',
  '42501'
);

do $$
declare
  deleted int;
begin
  delete from public.parties where id = pg_temp.id('party_fixture');
  get diagnostics deleted = row_count;
  perform pg_temp.record('admin: cancella un soggetto', deleted = 1);
end;
$$;

reset role;

-- ---------------------------------------------------------------------------
-- Database owner (service scripts)
-- ---------------------------------------------------------------------------

select pg_temp.expect_error(
  'update su audit_logs dal proprietario del database: rifiutato',
  'update public.audit_logs set azione = ''delete''',
  '42501'
);

-- ---------------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------------

select case when ok then 'PASS' else 'FAIL' end || '  ' || name
       || coalesce('  (' || detail || ')', '')
from test_results
order by n;

select (count(*) filter (where ok)) || '/' || count(*) || ' test superati'
from test_results;

do $$
begin
  if exists (select 1 from test_results where not ok) then
    raise exception 'some tests failed';
  end if;
end;
$$;

rollback;

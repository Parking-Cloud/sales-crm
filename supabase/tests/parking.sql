-- Block 1a-2: car parks and price lists, administrator and operator access.
--
-- Run with all migrations applied, as the database owner:
--   npm run db:test   (Supabase Management API)
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/parking.sql
--
-- One transaction ending with ROLLBACK: nothing is left behind. Only fake
-- example.com addresses; the users email domain constraint is dropped inside
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

create temp table test_results (
  n serial primary key,
  name text not null,
  ok boolean not null,
  detail text
);
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

-- Runs a statement that must change exactly `expected` rows.
create function pg_temp.expect_rows(name text, stmt text, expected int)
returns void language plpgsql as $$
declare
  changed int;
begin
  execute stmt;
  get diagnostics changed = row_count;
  perform pg_temp.record(name, changed = expected, changed || ' righe');
exception when others then
  perform pg_temp.record(name, false, 'errore ' || sqlstate || ': ' || sqlerrm);
end;
$$;

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text,
    true
  );
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
from auth.users
where email in ('test-admin@example.com', 'test-operatore@example.com');

-- ---------------------------------------------------------------------------
-- Administrator
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('admin'));

do $$
declare
  new_id uuid;
begin
  insert into public.parking_facilities
    (nome, tipo, indirizzo, cap, citta, capacita, posti_commerciali, raggio_m, stato_campagna, note, lat, lng)
  values
    ('Parcheggio Esempio', 'autorimessa', 'Via Esempio 1', '20100', 'Milano', 120, 80, 500, 'bozza', 'Nota di prova', 45.4642, 9.19)
  returning id into new_id;
  insert into test_ids values ('parking', new_id);
  perform pg_temp.record('admin: crea un parcheggio con CAP, città e note', true);
exception when others then
  perform pg_temp.record('admin: crea un parcheggio con CAP, città e note', false, sqlstate || ': ' || sqlerrm);
end;
$$;

select pg_temp.expect_rows(
  'admin: modifica il parcheggio',
  format($$update public.parking_facilities set stato_campagna = 'attiva', note = 'Nota aggiornata' where id = %L$$, pg_temp.id('parking')),
  1
);

do $$
declare
  new_id uuid;
begin
  insert into public.parking_products
    (parking_id, nome, tipo, giorni, ora_da, ora_a, periodo, prezzo_netto, iva_pct, posti_disponibili, note, attivo)
  values
    (pg_temp.id('parking'), 'Diurno 5/7', 'abbonamento', '5/7', '07:00', '19:00', 'mese', 100.00, 22.00, 40, 'Prodotto di prova', true)
  returning id into new_id;
  insert into test_ids values ('product', new_id);
  perform pg_temp.record('admin: crea un prodotto con prezzo', true);
exception when others then
  perform pg_temp.record('admin: crea un prodotto con prezzo', false, sqlstate || ': ' || sqlerrm);
end;
$$;

select pg_temp.expect_rows(
  'admin: modifica il prezzo e i posti del prodotto',
  format('update public.parking_products set prezzo_netto = 110.50, posti_disponibili = 45 where id = %L', pg_temp.id('product')),
  1
);

select pg_temp.expect_rows(
  'admin: archivia il parcheggio',
  format('update public.parking_facilities set archived_at = now() where id = %L', pg_temp.id('parking')),
  1
);

select pg_temp.expect_rows(
  'admin: ripristina il parcheggio',
  format('update public.parking_facilities set archived_at = null where id = %L', pg_temp.id('parking')),
  1
);

reset role;

select pg_temp.record(
  'audit: creazione, modifiche e archiviazione registrate con l''autore',
  (select count(*) from public.audit_logs
   where entita = 'parking_facilities' and entita_id = pg_temp.id('parking')
     and utente_id = pg_temp.id('admin')) = 4
  and (select count(*) from public.audit_logs
   where entita = 'parking_products' and entita_id = pg_temp.id('product')
     and utente_id = pg_temp.id('admin')) = 2
);

-- ---------------------------------------------------------------------------
-- Operator: reads everything, every write is refused
-- ---------------------------------------------------------------------------

select pg_temp.act_as(pg_temp.id('operatore'));

select pg_temp.record(
  'operatore: legge il parcheggio e il listino',
  (select count(*) from public.parking_facilities where id = pg_temp.id('parking')) = 1
  and (select count(*) from public.parking_products where id = pg_temp.id('product')) = 1
);

select pg_temp.expect_error(
  'operatore: non crea parcheggi',
  $$insert into public.parking_facilities (nome, tipo) values ('Altro Parcheggio Esempio', 'aziendale')$$,
  '42501'
);
select pg_temp.expect_rows(
  'operatore: non modifica il parcheggio',
  format($$update public.parking_facilities set nome = 'Nome Cambiato' where id = %L$$, pg_temp.id('parking')),
  0
);
select pg_temp.expect_rows(
  'operatore: non archivia il parcheggio',
  format('update public.parking_facilities set archived_at = now() where id = %L', pg_temp.id('parking')),
  0
);
select pg_temp.expect_rows(
  'operatore: non cancella il parcheggio',
  format('delete from public.parking_facilities where id = %L', pg_temp.id('parking')),
  0
);
select pg_temp.expect_error(
  'operatore: non crea prodotti',
  format($$insert into public.parking_products (parking_id, nome, tipo) values (%L, 'Carnet Esempio', 'carnet')$$, pg_temp.id('parking')),
  '42501'
);
select pg_temp.expect_rows(
  'operatore: non modifica il prodotto',
  format($$update public.parking_products set nome = 'Nome Cambiato' where id = %L$$, pg_temp.id('product')),
  0
);
select pg_temp.expect_rows(
  'operatore: non modifica il prezzo',
  format('update public.parking_products set prezzo_netto = 1 where id = %L', pg_temp.id('product')),
  0
);
select pg_temp.expect_rows(
  'operatore: non cancella il prodotto',
  format('delete from public.parking_products where id = %L', pg_temp.id('product')),
  0
);

reset role;

select pg_temp.record(
  'dati invariati dopo i tentativi dell''operatore',
  exists (
    select 1 from public.parking_facilities
    where id = pg_temp.id('parking') and nome = 'Parcheggio Esempio' and archived_at is null
  )
  and exists (
    select 1 from public.parking_products
    where id = pg_temp.id('product') and nome = 'Diurno 5/7' and prezzo_netto = 110.50
  )
);

-- ---------------------------------------------------------------------------
-- Report: one result set (the last one), also returned by the Management API.
-- ---------------------------------------------------------------------------

select esito from (
  select n, case when ok then 'PASS' else 'FAIL' end || '  ' || name
            || coalesce('  (' || detail || ')', '') as esito
  from test_results
  union all
  select 1000000, (count(*) filter (where ok)) || '/' || count(*) || ' test superati'
  from test_results
) report
order by n;

rollback;

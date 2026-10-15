-- Block 1a-7, part C: suppression list ("lista di esclusione") matched by a
-- keyed hash, opposition from any channel, removal by administrators only.
--
-- Every entry keeps a keyed SHA-256 of its normalized value (valore_hash);
-- all checks compare hashes. Ordinary entries also keep the value in clear,
-- to be read on /esclusioni. Entries left by a GDPR erasure keep only the
-- hash (block 1a-7, C3): the value cannot be read back from the database,
-- yet a new import or email with the same value is still blocked.
--
-- The key ("pepper") is generated inside the database at migration time,
-- lives in a schema not exposed by the API and is readable only through
-- suppression_hash(). Without it a phone number cannot be found again by
-- trying all numbers against the hash. Core PostgreSQL only (sha256()).
--
-- Entries are removed softly (rimossa_il, rimossa_da, motivo_rimozione):
-- the audit keeps who removed what and why.

create schema if not exists crm_private;
revoke all on schema crm_private from public;

create table crm_private.secrets (
  chiave text primary key,
  valore text not null
);
revoke all on crm_private.secrets from public;

insert into crm_private.secrets (chiave, valore)
values ('suppression_pepper', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));

create function public.suppression_hash(p_value text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when nullif(btrim(p_value), '') is null then null
    else encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        (select s.valore from crm_private.secrets s where s.chiave = 'suppression_pepper') || ':' || btrim(p_value),
        'UTF8'
      )),
      'hex'
    )
  end
$$;

revoke all on function public.suppression_hash(text) from public;
grant execute on function public.suppression_hash(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Table changes
-- ---------------------------------------------------------------------------

alter table public.suppression_list
  drop constraint suppression_list_valore_normalizzato_key,
  drop constraint suppression_list_normalized,
  alter column valore_normalizzato drop not null,
  add column valore_hash text,
  add column canale text,
  add column gdpr boolean not null default false,
  add column rimossa_il timestamptz,
  add column rimossa_da uuid references public.users (id) on update cascade on delete set null,
  add column motivo_rimozione text,
  -- Normalized by the functions that write it: trimmed, never empty.
  -- Only GDPR entries go without the value in clear.
  add constraint suppression_list_value check (
    (valore_normalizzato is null and gdpr)
    or (valore_normalizzato is not null and valore_normalizzato = btrim(valore_normalizzato) and valore_normalizzato <> '')
  ),
  add constraint suppression_list_canale_check
    check (canale is null or canale in ('telefono', 'email', 'di_persona', 'posta', 'altro')),
  add constraint suppression_list_removal check (
    (rimossa_il is null and rimossa_da is null and motivo_rimozione is null)
    or (rimossa_il is not null and nullif(btrim(motivo_rimozione), '') is not null)
  );

-- The hash always follows the value in clear; a GDPR entry keeps the hash it
-- was given.
create function public.set_suppression_hash()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.valore_normalizzato is not null then
    new.valore_hash := public.suppression_hash(new.valore_normalizzato);
  end if;
  if new.valore_hash is null then
    raise exception 'a suppression entry needs a value' using errcode = '23502';
  end if;
  return new;
end;
$$;

revoke all on function public.set_suppression_hash() from public;

create trigger set_suppression_hash
  before insert or update of valore_normalizzato, valore_hash on public.suppression_list
  for each row execute function public.set_suppression_hash();

update public.suppression_list set valore_hash = public.suppression_hash(valore_normalizzato);

alter table public.suppression_list alter column valore_hash set not null;

-- One active entry per value; removed entries stay as history.
create unique index suppression_list_active_hash on public.suppression_list (valore_hash) where rimossa_il is null;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------

-- True when any of the values is in the suppression list (active entries).
create function public.is_suppressed(p_values text[])
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.suppression_list s
    where s.rimossa_il is null
      and s.valore_hash in (
        select public.suppression_hash(v) from unnest(coalesce(p_values, '{}')) v where nullif(btrim(v), '') is not null
      )
  )
$$;

grant execute on function public.is_suppressed(text[]) to authenticated;

-- Duplicate check: the suppression list block now compares hashes and also
-- covers VAT number and Google place. Otherwise unchanged (block 1a-3).
create or replace function public.check_party_duplicates(
  p_party_id uuid default null,
  p_denominazione text default null,
  p_nome text default null,
  p_cognome text default null,
  p_piva text default null,
  p_place_id text default null,
  p_telefono text default null,
  p_email text default null,
  p_sito text default null,
  p_cap text default null,
  p_citta text default null
)
returns table (livello text, motivo text, party_id uuid, nome text, valore text)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select
      public.normalize_piva(p_piva) as piva,
      nullif(btrim(p_place_id), '') as place_id,
      public.normalize_phone(p_telefono) as phone,
      nullif(lower(btrim(p_email)), '') as email,
      case when public.is_generic_domain(public.normalize_domain(p_sito)) then null
           else public.normalize_domain(p_sito) end as site_domain,
      case when public.is_generic_domain(public.normalize_domain(p_email)) then null
           else public.normalize_domain(p_email) end as email_domain,
      public.party_search_name(p_denominazione, p_nome, p_cognome) as search_name,
      nullif(btrim(p_cap), '') as cap,
      nullif(lower(btrim(p_citta)), '') as citta
  ),
  hashes as (
    select public.suppression_hash(v) as h
    from input i
    cross join lateral unnest(array[i.email, i.phone, i.site_domain, i.email_domain, i.piva, i.place_id]) v
    where v is not null
  ),
  live as (
    select p.*, public.party_search_name(p.denominazione, p.nome, p.cognome) as search_name
    from public.parties p
    where p.merged_into_id is null
      and (p_party_id is null or p.id <> p_party_id)
  ),
  phones as (
    -- Phones of live parties and of their contacts.
    select l.id as party_id, l.telefono as phone from live l where l.telefono is not null
    union
    select c.party_id, btrim(part)
    from public.contacts c
    join live l on l.id = c.party_id
    cross join lateral regexp_split_to_table(coalesce(c.telefono, ''), ',') as part
    where btrim(part) <> ''
  ),
  matches as (
    -- Blocks
    select 'blocco' as livello, 'Stessa partita IVA' as motivo, l.id as party_id, i.piva as valore
    from live l, input i
    where i.piva is not null and l.piva = i.piva

    union all
    select 'blocco', 'Stesso luogo Google (place_id)', l.id, i.place_id
    from input i
    join public.external_references r
      on r.sistema = 'google_places' and r.entita = 'parties' and r.id_esterno = i.place_id
    join public.parties p on p.id = r.entita_id
    join live l on l.id = coalesce(p.merged_into_id, p.id)
    where i.place_id is not null

    union all
    select 'blocco', 'Nella lista di esclusione (' || s.tipo::text || ')',
      (select l.id from live l
       where s.valore_normalizzato is not null
         and (l.email = s.valore_normalizzato or l.telefono = s.valore_normalizzato or l.dominio = s.valore_normalizzato
              or l.piva = s.valore_normalizzato)
       limit 1),
      coalesce(s.valore_normalizzato, 'dato cancellato (GDPR)')
    from public.suppression_list s
    where s.rimossa_il is null and s.valore_hash in (select h from hashes)

    -- Warnings
    union all
    select 'avviso', 'Stesso telefono', ph.party_id, i.phone
    from phones ph, input i
    where i.phone is not null and ph.phone = i.phone

    union all
    select 'avviso', 'Stesso dominio del sito', l.id, l.dominio
    from live l, input i
    where l.dominio is not null
      and not public.is_generic_domain(l.dominio)
      and l.dominio in (i.site_domain, i.email_domain)

    union all
    select 'avviso', 'Nome simile nella stessa zona', l.id, l.search_name
    from live l, input i
    where i.search_name <> ''
      and (i.cap is not null or i.citta is not null)
      and extensions.similarity(l.search_name, i.search_name) >= 0.6
      and exists (
        select 1 from public.party_locations pl
        where pl.party_id = l.id
          and ((i.cap is not null and pl.cap = i.cap) or (i.citta is not null and lower(pl.citta) = i.citta))
      )
  )
  select distinct on (m.livello, m.motivo, m.party_id)
    m.livello,
    m.motivo,
    m.party_id,
    coalesce(p.denominazione, nullif(btrim(concat_ws(' ', p.nome, p.cognome)), '')),
    m.valore
  from matches m
  left join public.parties p on p.id = m.party_id
  order by m.livello desc, m.motivo, m.party_id
$$;

-- ---------------------------------------------------------------------------
-- "Non contattare" (C1)
-- ---------------------------------------------------------------------------

-- Values that identify a party or a contact: emails, phones, web domain
-- (generic mail domains excluded), and for a party its VAT number and Google
-- place. For a party, its contacts' values are included: the whole company
-- opted out.
create or replace function public.do_not_contact_values(p_entita text, p_id uuid)
returns table (tipo public.suppression_type, valore text)
language sql
stable
security invoker
set search_path = ''
as $$
  with contact_rows as (
    select c.email, c.telefono
    from public.contacts c
    where (p_entita = 'contacts' and c.id = p_id)
       or (p_entita = 'parties' and c.party_id = p_id)
  ),
  party_row as (
    select p.id, p.email, p.telefono, p.dominio, p.piva
    from public.parties p
    where p_entita = 'parties' and p.id = p_id
  )
  select distinct v.tipo, v.valore
  from (
    select 'email'::public.suppression_type as tipo, email as valore from party_row
    union all
    select 'telefono', telefono from party_row
    union all
    select 'dominio', dominio from party_row where not public.is_generic_domain(dominio)
    union all
    select 'piva', piva from party_row
    union all
    select 'place_id', r.id_esterno
    from party_row pr
    join public.external_references r on r.sistema = 'google_places' and r.entita = 'parties' and r.entita_id = pr.id
    union all
    select 'email', email from contact_rows
    union all
    select 'telefono', btrim(part)
    from contact_rows cross join lateral regexp_split_to_table(coalesce(telefono, ''), ',') as part
  ) v
  where v.valore is not null and btrim(v.valore) <> ''
$$;

-- Loss reason label for the history (adds "non_contattare").
create or replace function public.loss_reason_label(p_reason public.loss_reason)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_reason
    when 'mezzi_pubblici' then 'usa i mezzi pubblici'
    when 'ha_gia_parcheggio' then 'ha già un parcheggio'
    when 'trasloco' then 'trasloco'
    when 'prezzo' then 'prezzo'
    when 'nessun_bisogno' then 'nessun bisogno'
    when 'non_raggiungibile' then 'non raggiungibile'
    when 'altro' then 'altro'
    when 'non_contattare' then 'ha chiesto di non essere contattato'
  end
$$;

-- Flags a party or a contact as "do not contact" (any active user), adds its
-- values to the suppression list with reason and channel, closes the open
-- opportunities as lost ("non_contattare": of the party, or of the contact
-- when only a contact opposed) and closes their open reminders. One
-- transaction. Returns { valori, opportunita_chiuse }.
drop function public.mark_do_not_contact(text, uuid, text);

create function public.mark_do_not_contact(p_entita text, p_id uuid, p_motivo text, p_canale text default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_added integer;
  v_closed integer;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if v_motivo is null then
    raise exception 'a reason is required' using errcode = '23514';
  end if;

  if p_entita = 'parties' then
    update public.parties set non_contattare = true where id = p_id;
  elsif p_entita = 'contacts' then
    update public.contacts set non_contattare = true where id = p_id;
  else
    raise exception 'unknown entity %', p_entita using errcode = '22023';
  end if;
  if not found then
    raise exception 'record not found' using errcode = 'P0002';
  end if;

  insert into public.suppression_list (tipo, valore_normalizzato, motivo, canale)
  select v.tipo, v.valore, v_motivo, p_canale
  from public.do_not_contact_values(p_entita, p_id) v
  on conflict (valore_hash) where rimossa_il is null do nothing;
  get diagnostics v_added = row_count;

  with closed as (
    update public.opportunities o
    set esito = 'persa', motivo_perdita = 'non_contattare', nota_perdita = left('Non contattare: ' || v_motivo, 2000)
    where o.esito = 'aperta'
      and ((p_entita = 'parties' and o.party_id = p_id) or (p_entita = 'contacts' and o.contact_id = p_id))
    returning o.id
  ), done as (
    update public.tasks t
    set completata_il = now()
    where t.completata_il is null and t.opportunity_id in (select id from closed)
    returning t.id
  )
  select count(*) into v_closed from closed;

  if p_entita = 'parties' then
    update public.tasks t set completata_il = now() where t.completata_il is null and t.party_id = p_id;
  end if;

  return jsonb_build_object('valori', v_added, 'opportunita_chiuse', v_closed);
end;
$$;

grant execute on function public.mark_do_not_contact(text, uuid, text, text) to authenticated;

-- Removes the flag; the matching suppression entries are removed softly with
-- a reason. Administrators only. GDPR entries stay. Returns the number of
-- entries removed.
create or replace function public.clear_do_not_contact(p_entita text, p_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  removed integer;
begin
  if not public.is_admin() then
    raise exception 'only administrators can remove "do not contact"' using errcode = '42501';
  end if;

  update public.suppression_list s
  set rimossa_il = now(), rimossa_da = auth.uid(), motivo_rimozione = 'Tolto "Non contattare" dalla scheda'
  where s.rimossa_il is null
    and not s.gdpr
    and s.valore_hash in (select public.suppression_hash(v.valore) from public.do_not_contact_values(p_entita, p_id) v);
  get diagnostics removed = row_count;

  if p_entita = 'parties' then
    update public.parties set non_contattare = false where id = p_id;
  elsif p_entita = 'contacts' then
    update public.contacts set non_contattare = false where id = p_id;
  else
    raise exception 'unknown entity %', p_entita using errcode = '22023';
  end if;
  return removed;
end;
$$;

-- ---------------------------------------------------------------------------
-- /esclusioni (C2)
-- ---------------------------------------------------------------------------

-- Manual entry (any active user): the value is normalized by type; generic
-- mail domains are refused (they would block unrelated people).
create function public.add_suppression(p_tipo public.suppression_type, p_valore text, p_motivo text, p_canale text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_value text;
  v_id uuid;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'a reason is required' using errcode = '23514';
  end if;
  v_value := case p_tipo
    when 'email' then case when public.is_valid_email(lower(btrim(p_valore))) then lower(btrim(p_valore)) end
    when 'telefono' then public.normalize_phone(p_valore)
    when 'dominio' then public.normalize_domain(p_valore)
    when 'piva' then public.normalize_piva(p_valore)
    when 'place_id' then nullif(btrim(p_valore), '')
  end;
  if v_value is null then
    raise exception 'invalid value for %', p_tipo using errcode = '22023';
  end if;
  if p_tipo = 'dominio' and public.is_generic_domain(v_value) then
    raise exception 'generic mail domain' using errcode = '22023';
  end if;
  insert into public.suppression_list (tipo, valore_normalizzato, motivo, canale)
  values (p_tipo, v_value, btrim(p_motivo), p_canale)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.add_suppression(public.suppression_type, text, text, text) to authenticated;

-- Removal: administrators only, with a reason; GDPR entries stay (they are
-- the only trace that blocks the erased person from coming back).
create function public.remove_suppression(p_id uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only administrators can remove entries' using errcode = '42501';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'a reason is required' using errcode = '23514';
  end if;
  update public.suppression_list
  set rimossa_il = now(), rimossa_da = auth.uid(), motivo_rimozione = btrim(p_motivo)
  where id = p_id and rimossa_il is null and not gdpr;
  if not found then
    raise exception 'entry not found, already removed or from a GDPR erasure' using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.remove_suppression(uuid, text) to authenticated;

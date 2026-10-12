-- Block 1a-3: duplicate check for parties (spec "Deduplicazione", CRM-11).
--
-- Block (the party must not be created or saved):
--   same VAT number, same Google place_id, or a value in the suppression list
--   (email, phone, domain).
-- Warning (the user confirms "same" or "different"):
--   same normalized phone, same web domain (generic mail domains excluded),
--   similar name (trigram similarity >= 0.6) in the same postcode or city.
-- Merged parties are skipped; matches point to live parties only.

-- Mail and hosting domains shared by unrelated people: never a duplicate
-- signal and never added to the suppression list. The only list.
create function public.generic_email_domains()
returns text[]
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select array[
    'gmail.com', 'googlemail.com', 'libero.it', 'hotmail.com', 'hotmail.it',
    'outlook.com', 'outlook.it', 'live.com', 'live.it', 'msn.com',
    'yahoo.com', 'yahoo.it', 'ymail.com', 'icloud.com', 'me.com', 'mac.com',
    'alice.it', 'tim.it', 'tin.it', 'tiscali.it', 'virgilio.it', 'email.it',
    'fastwebnet.it', 'inwind.it', 'iol.it', 'aruba.it', 'pec.it',
    'legalmail.it', 'postecert.it', 'arubapec.it', 'gmx.com', 'gmx.it',
    'protonmail.com', 'proton.me', 'aol.com'
  ]
$$;

create function public.is_generic_domain(domain text)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select domain is not null and domain = any (public.generic_email_domains())
$$;

create function public.check_party_duplicates(
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
       where l.email = s.valore_normalizzato or l.telefono = s.valore_normalizzato or l.dominio = s.valore_normalizzato
       limit 1),
      s.valore_normalizzato
    from public.suppression_list s, input i
    where s.valore_normalizzato in (i.email, i.phone, i.site_domain, i.email_domain)

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

grant execute on function public.check_party_duplicates(uuid, text, text, text, text, text, text, text, text, text, text)
  to authenticated;

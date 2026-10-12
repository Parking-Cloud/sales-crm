-- Block 1a-3: party list and search.
--
-- normalize_phone / normalize_domain are the single source of truth for the
-- normalized forms stored in the database and used in searches, duplicate
-- checks and the suppression list.

-- Italian phone numbers in +39 form: separators removed, 00 becomes +,
-- numbers starting with 0 (landline) or 3 (mobile) get +39.
-- Returns null for empty input; anything else is returned cleaned but
-- otherwise unchanged (the application validates it).
create function public.normalize_phone(raw text)
returns text
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $$
declare
  cleaned text := regexp_replace(coalesce(raw, ''), '[\s.\-/()]', '', 'g');
begin
  if cleaned = '' then
    return null;
  end if;
  if cleaned ~ '^00\d' then
    cleaned := '+' || substr(cleaned, 3);
  end if;
  if cleaned ~ '^\+\d{6,15}$' then
    return cleaned;
  end if;
  if cleaned ~ '^[03]\d{5,11}$' then
    return '+39' || cleaned;
  end if;
  return cleaned;
end;
$$;

-- Host name of a web site: lower case, without scheme, "www.", port, path,
-- query or fragment. Null when there is no dotted host name.
create function public.normalize_domain(raw text)
returns text
language plpgsql
immutable
parallel safe
set search_path = pg_catalog
as $$
declare
  host text := lower(btrim(coalesce(raw, '')));
begin
  host := regexp_replace(host, '^[a-z][a-z0-9+.\-]*://', '');
  host := regexp_replace(host, '^[^/@]*@', '');
  host := split_part(split_part(split_part(split_part(host, '/', 1), '?', 1), '#', 1), ':', 1);
  host := regexp_replace(host, '^www\.', '');
  host := rtrim(host, '.');
  if host !~ '^[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)+$' then
    return null;
  end if;
  return host;
end;
$$;

-- VAT number: upper case, no spaces or dots; Italian "IT" prefix removed.
create function public.normalize_piva(raw text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select nullif(
    regexp_replace(upper(regexp_replace(coalesce(raw, ''), '[\s.]', '', 'g')), '^IT(\d{11})$', '\1'),
    ''
  )
$$;

-- Fields whose provenance is tracked on a party (CRM-09).
create function public.party_tracked_fields()
returns text[]
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select array['telefono', 'email', 'sito', 'dipendenti_stimati', 'parcheggio_privato']
$$;

-- Party list with search, filters and paging. Runs with the caller's rights:
-- row level security applies. Merged parties are never listed.
-- The search matches similar names (trigrams), VAT number, phone and domain.
create function public.search_parties(
  p_query text default null,
  p_tipo public.party_type default null,
  p_categoria text default null,
  p_citta text default null,
  p_solo_da_verificare boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  tipo public.party_type,
  denominazione text,
  nome text,
  cognome text,
  categoria text,
  citta text,
  telefono text,
  non_contattare boolean,
  campi_verificati integer,
  campi_valorizzati integer,
  somiglianza real,
  totale bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      nullif(lower(btrim(p_query)), '') as q,
      public.normalize_phone(p_query) as q_phone,
      public.normalize_domain(p_query) as q_domain,
      public.normalize_piva(p_query) as q_piva,
      nullif(lower(btrim(p_citta)), '') as citta
  ),
  base as (
    select
      p.*,
      public.party_search_name(p.denominazione, p.nome, p.cognome) as search_name,
      (
        select l.citta
        from public.party_locations l
        where l.party_id = p.id
        order by l.principale desc, l.created_at
        limit 1
      ) as main_city,
      (
        (p.telefono is not null)::int
        + (p.email is not null)::int
        + (p.sito is not null)::int
        + (p.dipendenti_stimati is not null)::int
        + (p.parcheggio_privato <> 'non_noto')::int
      ) as valued,
      (
        select count(*)::int
        from public.field_provenance f
        where f.entita = 'parties'
          and f.entita_id = p.id
          and f.stato = 'verificato'
          and f.campo = any (public.party_tracked_fields())
      ) as verified
    from public.parties p
    where p.merged_into_id is null
  ),
  matched as (
    select
      b.*,
      case
        when params.q is null then null
        else greatest(
          extensions.similarity(b.search_name, params.q),
          extensions.word_similarity(params.q, b.search_name)
        )
      end as score
    from base b, params
    where (p_tipo is null or b.tipo = p_tipo)
      and (p_categoria is null or b.categoria = p_categoria)
      and (params.citta is null or lower(b.main_city) = params.citta)
      and (not p_solo_da_verificare or b.verified < b.valued)
      and (
        params.q is null
        or b.search_name like '%' || replace(replace(replace(params.q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        or extensions.word_similarity(params.q, b.search_name) >= 0.5
        or extensions.similarity(b.search_name, params.q) >= 0.3
        or (params.q_piva is not null and b.piva = params.q_piva)
        or (params.q_phone is not null and b.telefono = params.q_phone)
        or (params.q_domain is not null and b.dominio = params.q_domain)
      )
  )
  select
    m.id, m.tipo, m.denominazione, m.nome, m.cognome, m.categoria, m.main_city, m.telefono,
    m.non_contattare, m.verified, m.valued, m.score, count(*) over ()
  from matched m
  order by m.score desc nulls last, m.search_name
  limit greatest(least(p_limit, 200), 1)
  offset greatest(p_offset, 0)
$$;

grant execute on function public.search_parties(text, public.party_type, text, text, boolean, integer, integer)
  to authenticated;

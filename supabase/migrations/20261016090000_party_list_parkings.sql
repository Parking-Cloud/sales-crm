-- Block 1a-6, A1: car parks in the party list.
-- - parking_facilities.nome_breve: optional short name for lists and cards
--   (the full name is used when empty).
-- - search_parties returns the party's opportunities (car park short name,
--   stage, outcome), filters by car park (any of a list, or none at all) and
--   sorts by car park. Same rules as before for search and filters.

alter table public.parking_facilities
  add column nome_breve text,
  add constraint parking_facilities_nome_breve_length check (nome_breve is null or char_length(btrim(nome_breve)) between 1 and 40);

drop function public.search_parties(text, public.party_type, text, text, boolean, integer, integer);

create function public.search_parties(
  p_query text default null,
  p_tipo public.party_type default null,
  p_categoria text default null,
  p_citta text default null,
  p_solo_da_verificare boolean default false,
  p_limit integer default 50,
  p_offset integer default 0,
  p_parcheggi uuid[] default null,
  p_senza_parcheggio boolean default false,
  p_ordina text default null
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
  parcheggi jsonb,
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
      nullif(lower(btrim(p_citta)), '') as citta,
      coalesce(array_length(p_parcheggi, 1), 0) > 0 as by_parking
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
      ) as verified,
      (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'opportunity_id', o.id, 'parking_id', f.id,
                 'parcheggio', coalesce(f.nome_breve, f.nome), 'fase', o.fase, 'esito', o.esito)
                 order by (o.esito = 'aperta') desc, coalesce(f.nome_breve, f.nome)), '[]'::jsonb)
        from public.opportunities o
        join public.parking_facilities f on f.id = o.parking_id
        where o.party_id = p.id
      ) as parkings,
      (
        select min(coalesce(f.nome_breve, f.nome))
        from public.opportunities o
        join public.parking_facilities f on f.id = o.parking_id
        where o.party_id = p.id
      ) as first_parking
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
        (not params.by_parking and not coalesce(p_senza_parcheggio, false))
        or (params.by_parking and exists (
              select 1 from public.opportunities o where o.party_id = b.id and o.parking_id = any (p_parcheggi)))
        or (coalesce(p_senza_parcheggio, false) and not exists (
              select 1 from public.opportunities o where o.party_id = b.id))
      )
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
    m.non_contattare, m.verified, m.valued, m.score, m.parkings, count(*) over ()
  from matched m
  order by
    case when p_ordina = 'parcheggio' then lower(m.first_parking) end asc nulls last,
    case when p_ordina = 'parcheggio_desc' then lower(m.first_parking) end desc nulls last,
    m.score desc nulls last,
    m.search_name
  limit greatest(least(p_limit, 200), 1)
  offset greatest(p_offset, 0)
$$;

grant execute on function public.search_parties(text, public.party_type, text, text, boolean, integer, integer, uuid[], boolean, text)
  to authenticated;

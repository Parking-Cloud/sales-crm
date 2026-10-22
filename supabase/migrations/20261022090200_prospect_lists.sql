-- Block 1a-9: reads of the Prospect, Pipeline and Promemoria tables, with
-- filters, sorting and pages of rows (security invoker: RLS applies).
-- Telephone, email and contact person come from the main contact, with the
-- party's own telephone and email when the contact has none.
-- Text filters match a part of the value, ignoring case; telephone filters
-- compare digits only. Sorting: one key, ascending or descending, empty
-- values last, then by name.

-- "%text%" for ILIKE, with the wildcards of the text escaped.
create function public.like_contains(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '%' || replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

-- Telephone filter: digits against digits; a filter without digits
-- matches the text.
create function public.phone_matches(p_phone text, p_filter text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when nullif(btrim(coalesce(p_filter, '')), '') is null then true
    when regexp_replace(p_filter, '\D', '', 'g') = '' then coalesce(p_phone, '') ilike public.like_contains(btrim(p_filter))
    else regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') like '%' || regexp_replace(p_filter, '\D', '', 'g') || '%'
  end
$$;

grant execute on function public.like_contains(text) to authenticated;
grant execute on function public.phone_matches(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Prospect
-- ---------------------------------------------------------------------------

-- p_ultimo_contatto: 'mai', 'settimana' (last 7 days), 'mese' (last 30
-- days), 'oltre_mese'. p_ordina: stato, parcheggio, nome, categoria,
-- telefono, email, ultimo_contatto, referente, note.
create function public.prospect_rows(
  p_stati public.prospect_status[] default null,
  p_parcheggio uuid default null,
  p_senza_parcheggio boolean default false,
  p_nome text default null,
  p_categoria text default null,
  p_telefono text default null,
  p_email text default null,
  p_ultimo_contatto text default null,
  p_referente text default null,
  p_note text default null,
  p_ordina text default 'nome',
  p_desc boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  stato public.prospect_status,
  motivo_non_interesse public.loss_reason,
  nome text,
  tipo public.party_type,
  categoria text,
  telefono text,
  email text,
  contatto_id uuid,
  referente text,
  ultimo_contatto_il date,
  note text,
  non_contattare boolean,
  cancellato boolean,
  parcheggi jsonb,
  totale bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select
      p.id,
      p.stato_prospect as stato,
      p.motivo_non_interesse,
      coalesce(nullif(btrim(p.denominazione), ''), nullif(btrim(concat_ws(' ', p.nome, p.cognome)), ''), 'Senza nome') as nome,
      p.tipo,
      p.categoria,
      coalesce(c.telefono, p.telefono) as telefono,
      coalesce(c.email, p.email) as email,
      c.id as contatto_id,
      nullif(btrim(concat_ws(' ', c.nome, c.cognome)), '') as referente,
      p.ultimo_contatto_il,
      p.note,
      p.non_contattare or coalesce(c.non_contattare, false) as non_contattare,
      p.gdpr_cancellato_il is not null as cancellato,
      coalesce((
        select jsonb_agg(jsonb_build_object('parking_id', x.parking_id, 'nome', x.nome, 'opportunity_id', x.id, 'stato_offerta', x.stato_offerta)
                         order by x.nome)
        from (
          select distinct on (o.parking_id) o.parking_id, coalesce(f.nome_breve, f.nome) as nome, o.id, o.stato_offerta
          from public.opportunities o
          join public.parking_facilities f on f.id = o.parking_id
          where o.party_id = p.id
          order by o.parking_id, (o.stato_offerta is not null) desc, (o.esito = 'aperta') desc, o.created_at desc
        ) x
      ), '[]'::jsonb) as parcheggi
    from public.parties p
    left join lateral (
      select c.* from public.contacts c where c.party_id = p.id order by c.created_at, c.id limit 1
    ) c on true
    where p.merged_into_id is null
      and (p_stati is null or cardinality(p_stati) = 0 or p.stato_prospect = any (p_stati))
      and (p_categoria is null or p.categoria = p_categoria)
      and (p_parcheggio is null or exists (select 1 from public.opportunities o where o.party_id = p.id and o.parking_id = p_parcheggio))
      and (not coalesce(p_senza_parcheggio, false) or not exists (select 1 from public.opportunities o where o.party_id = p.id))
      and (p_ultimo_contatto is null or case p_ultimo_contatto
            when 'mai' then p.ultimo_contatto_il is null
            when 'settimana' then p.ultimo_contatto_il >= public.rome_today() - 7
            when 'mese' then p.ultimo_contatto_il >= public.rome_today() - 30
            when 'oltre_mese' then p.ultimo_contatto_il < public.rome_today() - 30
            else true end)
  ),
  filtered as (
    select b.*,
      case p_ordina
        when 'stato' then lpad(array_position(enum_range(null::public.prospect_status), b.stato)::text, 2, '0')
        when 'parcheggio' then lower(b.parcheggi -> 0 ->> 'nome')
        when 'categoria' then lower(b.categoria)
        when 'telefono' then b.telefono
        when 'email' then lower(b.email)
        when 'ultimo_contatto' then b.ultimo_contatto_il::text
        when 'referente' then lower(b.referente)
        when 'note' then lower(b.note)
        else lower(b.nome)
      end as chiave
    from base b
    where (nullif(btrim(coalesce(p_nome, '')), '') is null or b.nome ilike public.like_contains(btrim(p_nome)))
      and public.phone_matches(b.telefono, p_telefono)
      and (nullif(btrim(coalesce(p_email, '')), '') is null or b.email ilike public.like_contains(btrim(p_email)))
      and (nullif(btrim(coalesce(p_referente, '')), '') is null or b.referente ilike public.like_contains(btrim(p_referente)))
      and (nullif(btrim(coalesce(p_note, '')), '') is null or b.note ilike public.like_contains(btrim(p_note)))
  )
  select f.id, f.stato, f.motivo_non_interesse, f.nome, f.tipo, f.categoria, f.telefono, f.email, f.contatto_id, f.referente,
         f.ultimo_contatto_il, f.note, f.non_contattare, f.cancellato, f.parcheggi, count(*) over () as totale
  from filtered f
  order by
    case when not coalesce(p_desc, false) then f.chiave end asc nulls last,
    case when coalesce(p_desc, false) then f.chiave end desc nulls last,
    lower(f.nome), f.id
  limit least(greatest(coalesce(p_limit, 50), 1), 5000)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

grant execute on function public.prospect_rows(public.prospect_status[], uuid, boolean, text, text, text, text, text, text, text, text, boolean, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Pipeline and Promemoria
-- ---------------------------------------------------------------------------

-- One row per pair in the pipeline. giorni = days from today (Rome) to the
-- reminder date. p_promemoria: 'con', 'nessuno', 'scaduti' (before today),
-- 'entro3' (today to 3 days), 'oltre3'. p_ordina: nome, parcheggio,
-- responsabile, telefono, email, referente, stato, note, promemoria.
create function public.pipeline_rows(
  p_nome text default null,
  p_parcheggio uuid default null,
  p_responsabile uuid default null,
  p_senza_responsabile boolean default false,
  p_telefono text default null,
  p_email text default null,
  p_referente text default null,
  p_stati public.pipeline_offer_status[] default null,
  p_note text default null,
  p_promemoria text default null,
  p_ordina text default 'nome',
  p_desc boolean default false,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  party_id uuid,
  nome text,
  parking_id uuid,
  parcheggio text,
  responsabile_id uuid,
  responsabile text,
  telefono text,
  email text,
  contatto_id uuid,
  referente text,
  stato_offerta public.pipeline_offer_status,
  motivo_rifiuto public.loss_reason,
  note text,
  promemoria_il date,
  giorni integer,
  non_contattare boolean,
  totale bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select
      o.id,
      p.id as party_id,
      coalesce(nullif(btrim(p.denominazione), ''), nullif(btrim(concat_ws(' ', p.nome, p.cognome)), ''), 'Senza nome') as nome,
      o.parking_id,
      coalesce(f.nome_breve, f.nome) as parcheggio,
      o.responsabile_id,
      coalesce(nullif(btrim(u.nome), ''), u.email) as responsabile,
      coalesce(c.telefono, p.telefono) as telefono,
      coalesce(c.email, p.email) as email,
      c.id as contatto_id,
      nullif(btrim(concat_ws(' ', c.nome, c.cognome)), '') as referente,
      o.stato_offerta,
      case when o.stato_offerta = 'rifiutata' then o.motivo_perdita end as motivo_rifiuto,
      o.note,
      o.promemoria_il,
      public.reminder_days(o.promemoria_il) as giorni,
      p.non_contattare or coalesce(c.non_contattare, false) as non_contattare
    from public.opportunities o
    join public.parties p on p.id = o.party_id
    join public.parking_facilities f on f.id = o.parking_id
    left join public.users u on u.id = o.responsabile_id
    left join lateral (
      select c.* from public.contacts c where c.party_id = p.id order by c.created_at, c.id limit 1
    ) c on true
    where o.stato_offerta is not null
      and p.merged_into_id is null
      and (p_parcheggio is null or o.parking_id = p_parcheggio)
      and (p_responsabile is null or o.responsabile_id = p_responsabile)
      and (not coalesce(p_senza_responsabile, false) or o.responsabile_id is null)
      and (p_stati is null or cardinality(p_stati) = 0 or o.stato_offerta = any (p_stati))
      and (p_promemoria is null or case p_promemoria
            when 'con' then o.promemoria_il is not null
            when 'nessuno' then o.promemoria_il is null
            when 'scaduti' then o.promemoria_il < public.rome_today()
            when 'entro3' then o.promemoria_il between public.rome_today() and public.rome_today() + 3
            when 'oltre3' then o.promemoria_il > public.rome_today() + 3
            else true end)
  ),
  filtered as (
    select b.*,
      case p_ordina
        when 'parcheggio' then lower(b.parcheggio)
        when 'responsabile' then lower(b.responsabile)
        when 'telefono' then b.telefono
        when 'email' then lower(b.email)
        when 'referente' then lower(b.referente)
        when 'stato' then lpad(array_position(enum_range(null::public.pipeline_offer_status), b.stato_offerta)::text, 2, '0')
        when 'note' then lower(b.note)
        when 'promemoria' then b.promemoria_il::text
        else lower(b.nome)
      end as chiave
    from base b
    where (nullif(btrim(coalesce(p_nome, '')), '') is null or b.nome ilike public.like_contains(btrim(p_nome)))
      and public.phone_matches(b.telefono, p_telefono)
      and (nullif(btrim(coalesce(p_email, '')), '') is null or b.email ilike public.like_contains(btrim(p_email)))
      and (nullif(btrim(coalesce(p_referente, '')), '') is null or b.referente ilike public.like_contains(btrim(p_referente)))
      and (nullif(btrim(coalesce(p_note, '')), '') is null or b.note ilike public.like_contains(btrim(p_note)))
  )
  select f.id, f.party_id, f.nome, f.parking_id, f.parcheggio, f.responsabile_id, f.responsabile, f.telefono, f.email, f.contatto_id,
         f.referente, f.stato_offerta, f.motivo_rifiuto, f.note, f.promemoria_il, f.giorni, f.non_contattare, count(*) over () as totale
  from filtered f
  order by
    case when not coalesce(p_desc, false) then f.chiave end asc nulls last,
    case when coalesce(p_desc, false) then f.chiave end desc nulls last,
    lower(f.nome), lower(f.parcheggio), f.id
  limit least(greatest(coalesce(p_limit, 50), 1), 5000)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

grant execute on function public.pipeline_rows(text, uuid, uuid, boolean, text, text, text, public.pipeline_offer_status[], text, text, text, boolean, integer, integer) to authenticated;

-- Overdue reminders (menu counter): pipeline rows with a reminder date
-- before today in Rome.
create function public.count_overdue_reminders()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.opportunities o
  join public.parties p on p.id = o.party_id
  where o.stato_offerta is not null and o.promemoria_il < public.rome_today() and p.merged_into_id is null
$$;

grant execute on function public.count_overdue_reminders() to authenticated;

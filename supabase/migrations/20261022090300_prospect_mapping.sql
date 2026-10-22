-- Block 1a-9: existing data mapped to the prospect model.
--
-- Each opportunity says something about its prospect:
-- - Individuata, Da contattare, Contattata -> Da contattare;
-- - Interessata, Offerta inviata, Vinta and later -> Interessato;
-- - lost before the offer (up to Interessata) -> Non interessato;
-- - lost after the offer -> Interessato, with the offer refused.
-- A prospect is Interessato when one of its opportunities says so, otherwise
-- Da contattare when one is still open, otherwise Non interessato (with the
-- reason of its latest lost opportunity); Da contattare without
-- opportunities.
--
-- Pipeline rows of the Interessato prospects, one per pair (the open
-- opportunity, otherwise the latest): offer refused when lost, accepted when
-- won, sent at "Offerta inviata", otherwise to send. Pairs lost before the
-- offer stay out. The date of the next open reminder, if any, becomes the
-- reminder of the pipeline row.
--
-- map_prospect_status() does it for the given parties (all when null) that
-- have not been mapped yet (status Da contattare, no pipeline row); it stays
-- in the database for the tests and is not callable through the API.
-- Returns the counts by prospect status and offer status.

create function public.map_prospect_status(p_parties uuid[] default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_parties uuid[];
  v_result jsonb;
begin
  select array_agg(p.id) into v_parties
  from public.parties p
  where p.merged_into_id is null
    and (p_parties is null or p.id = any (p_parties))
    and p.stato_prospect = 'da_contattare'
    and not exists (select 1 from public.opportunities o where o.party_id = p.id and o.stato_offerta is not null);

  with signals as (
    select o.party_id, o.motivo_perdita, o.created_at,
      case
        when o.esito = 'persa' and o.fase in ('individuata', 'da_contattare', 'contattata', 'interessata') then 'non_interessato'
        when o.esito = 'persa' then 'interessato'
        when o.fase in ('individuata', 'da_contattare', 'contattata') then 'da_contattare'
        else 'interessato'
      end as segnale
    from public.opportunities o
    where o.party_id = any (v_parties)
  ),
  status as (
    select s.party_id,
      case
        when bool_or(s.segnale = 'interessato') then 'interessato'
        when bool_or(s.segnale = 'da_contattare') then 'da_contattare'
        else 'non_interessato'
      end::public.prospect_status as stato,
      (array_agg(s.motivo_perdita order by s.created_at desc) filter (where s.segnale = 'non_interessato'))[1] as motivo
    from signals s
    group by s.party_id
  )
  update public.parties p
  set stato_prospect = s.stato,
      motivo_non_interesse = case when s.stato = 'non_interessato' then s.motivo end
  from status s
  where s.party_id = p.id and s.stato <> 'da_contattare';

  with candidates as (
    select distinct on (o.party_id, o.parking_id) o.id, o.fase, o.esito
    from public.opportunities o
    join public.parties p on p.id = o.party_id
    where o.party_id = any (v_parties)
      and p.stato_prospect = 'interessato'
      and not (o.esito = 'persa' and o.fase in ('individuata', 'da_contattare', 'contattata', 'interessata'))
    order by o.party_id, o.parking_id, (o.esito = 'aperta') desc, o.created_at desc
  )
  update public.opportunities o
  set stato_offerta = case
        when c.esito = 'persa' then 'rifiutata'
        when c.esito = 'vinta' or c.fase in ('vinta', 'passata_bo', 'attivata') then 'accettata'
        when c.fase = 'offerta_inviata' then 'inviata'
        else 'da_inviare'
      end::public.pipeline_offer_status
  from candidates c
  where c.id = o.id;

  update public.opportunities
  set promemoria_il = (prossima_attivita_il at time zone 'Europe/Rome')::date
  where party_id = any (v_parties) and stato_offerta is not null and prossima_attivita_il is not null;

  select jsonb_build_object(
    'prospect', (select jsonb_object_agg(stato, n) from (
       select stato_prospect::text as stato, count(*) as n from public.parties where id = any (v_parties) group by 1) x),
    'pipeline', (select coalesce(jsonb_object_agg(stato, n), '{}'::jsonb) from (
       select stato_offerta::text as stato, count(*) as n from public.opportunities
       where party_id = any (v_parties) and stato_offerta is not null group by 1) y),
    'promemoria', (select count(*) from public.opportunities where party_id = any (v_parties) and promemoria_il is not null)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.map_prospect_status(uuid[]) from public, anon, authenticated;

select public.map_prospect_status(null);

-- Block 1a-10: Analytics, fix of analytics_events(). An "interessato" event
-- counts only for a prospect still in the CRM: a deleted prospect has no
-- event (it showed up as "Senza parcheggio"), a merged one counts for the
-- prospect it was merged into (its pipeline rows moved there). Everything
-- else as in 20261023090100_analytics.sql.

create or replace function public.analytics_events(
  p_da date,
  p_a date,
  p_parcheggio uuid default null,
  p_citta text default null,
  p_responsabile uuid default null
)
returns table (tipo text, giorno date, party_id uuid, opportunity_id uuid, parking_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  with pairs as (
    -- Prospect + car park pairs matching the filters.
    select o.id as opportunity_id, o.party_id, o.parking_id
    from public.opportunities o
    join public.parking_facilities f on f.id = o.parking_id
    where (p_parcheggio is null or o.parking_id = p_parcheggio)
      and (nullif(btrim(coalesce(p_citta, '')), '') is null or lower(btrim(f.citta)) = lower(btrim(p_citta)))
      and (p_responsabile is null or o.responsabile_id = p_responsabile)
  ),
  unfiltered as (
    select p_parcheggio is null and nullif(btrim(coalesce(p_citta, '')), '') is null and p_responsabile is null as yes
  ),
  party_events as (
    select 'contattato'::text as tipo, p.ultimo_contatto_il as giorno, p.id as party_id
    from public.parties p
    where p.merged_into_id is null and p.ultimo_contatto_il between p_da and p_a
    union all
    select 'interessato', public.rome_day(a.quando), coalesce(p.merged_into_id, p.id)
    from public.audit_logs a
    join public.parties p on p.id = a.entita_id
    where a.entita = 'parties' and a.azione in ('insert', 'update') and a.utente_id is not null
      and a.dopo ->> 'stato_prospect' in ('interessato', 'molto_interessato')
      and coalesce(a.prima ->> 'stato_prospect', '') not in ('interessato', 'molto_interessato')
      and public.rome_day(a.quando) between p_da and p_a
  ),
  offer_events as (
    select a.dopo ->> 'stato_offerta' as tipo, public.rome_day(a.quando) as giorno, a.entita_id as opportunity_id
    from public.audit_logs a
    where a.entita = 'opportunities' and a.azione in ('insert', 'update') and a.utente_id is not null
      and a.dopo ->> 'stato_offerta' in ('inviata', 'accettata', 'rifiutata')
      and (a.prima ->> 'stato_offerta') is distinct from (a.dopo ->> 'stato_offerta')
      and public.rome_day(a.quando) between p_da and p_a
  )
  select e.tipo, e.giorno, e.party_id, x.opportunity_id, x.parking_id
  from party_events e
  join pairs x on x.party_id = e.party_id
  union all
  select e.tipo, e.giorno, e.party_id, null, null
  from party_events e, unfiltered u
  where u.yes and not exists (select 1 from public.opportunities o where o.party_id = e.party_id)
  union all
  select e.tipo, e.giorno, x.party_id, x.opportunity_id, x.parking_id
  from offer_events e
  join pairs x on x.opportunity_id = e.opportunity_id
$$;

-- Block 1a-9, new rule for "Non interessato" (replaces the previous one):
-- - offer to send: the pipeline row leaves the pipeline (as before);
-- - offer sent: it becomes "Rifiutata", with the reason chosen for "Non
--   interessato" or "motivo non indicato"; stage, outcome and history follow
--   (apply_offer_status, log_opportunity_change, audit) with the author;
-- - offer accepted: the change is refused (23514, detail = car park) and
--   nothing changes.
-- Back to Interessato: pairs without a pipeline row come back as "Offerta da
-- inviare"; refused rows stay refused (they can be set back by hand).
-- Active leads are the rows with an offer to send or sent: the overdue
-- counter counts only those. The rule is applied to the data already there.

create or replace function public.set_prospect_status(
  p_party uuid,
  p_stato public.prospect_status,
  p_motivo public.loss_reason default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_party public.parties%rowtype;
  v_motivo public.loss_reason := case when p_stato = 'non_interessato' then p_motivo end;
  v_in integer := 0;
  v_out integer := 0;
  v_closed integer := 0;
  v_refused integer := 0;
  v_accepted text;
  r record;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_stato is null then
    raise exception 'status required' using errcode = '22023';
  end if;
  if v_motivo = 'non_contattare' then
    raise exception '"non_contattare" is set by "do not contact" only' using errcode = '22023';
  end if;
  select * into v_party from public.parties where id = p_party and merged_into_id is null for update;
  if v_party.id is null then
    raise exception 'party not found' using errcode = 'P0002';
  end if;
  if v_party.gdpr_cancellato_il is not null then
    raise exception 'party erased' using errcode = '22023';
  end if;

  -- An accepted offer is handled first: nothing changes.
  if p_stato = 'non_interessato' then
    select coalesce(f.nome_breve, f.nome) into v_accepted
    from public.opportunities o join public.parking_facilities f on f.id = o.parking_id
    where o.party_id = p_party and o.stato_offerta = 'accettata'
    order by 1
    limit 1;
    if v_accepted is not null then
      raise exception 'accepted offer' using errcode = '23514', detail = v_accepted;
    end if;
  end if;

  update public.parties
  set stato_prospect = p_stato, motivo_non_interesse = v_motivo
  where id = p_party
    and (stato_prospect, motivo_non_interesse) is distinct from (p_stato, v_motivo);

  if p_stato in ('interessato', 'molto_interessato') then
    -- One row per pair: the open opportunity, otherwise the latest one.
    for r in
      select distinct on (o.parking_id) o.id
      from public.opportunities o
      where o.party_id = p_party
        and not exists (select 1 from public.opportunities x
                        where x.party_id = p_party and x.parking_id = o.parking_id and x.stato_offerta is not null)
      order by o.parking_id, (o.esito = 'aperta') desc, o.created_at desc
    loop
      update public.opportunities set stato_offerta = 'da_inviare' where id = r.id;
      v_in := v_in + 1;
    end loop;
  else
    with gone as (
      update public.opportunities set stato_offerta = null
      where party_id = p_party and stato_offerta = 'da_inviare'
      returning 1
    )
    select count(*) into v_out from gone;

    if p_stato = 'non_interessato' then
      -- Offers sent become refused, with the reason of "Non interessato"
      -- (stage, outcome and history follow, with the author).
      with refused as (
        update public.opportunities set stato_offerta = 'rifiutata', motivo_perdita = coalesce(v_motivo, 'non_indicato')
        where party_id = p_party and stato_offerta = 'inviata'
        returning 1
      )
      select count(*) into v_refused from refused;

      with closed as (
        update public.opportunities set esito = 'persa', motivo_perdita = coalesce(v_motivo, 'non_indicato')
        where party_id = p_party and esito = 'aperta' and stato_offerta is null
        returning 1
      )
      select count(*) into v_closed from closed;
    end if;
  end if;

  return jsonb_build_object('entrate', v_in, 'uscite', v_out, 'chiuse', v_closed, 'rifiutate', v_refused);
end;
$$;

-- Overdue reminders of the active leads only.
create or replace function public.count_overdue_reminders()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.opportunities o
  join public.parties p on p.id = o.party_id
  where o.stato_offerta in ('da_inviare', 'inviata') and o.promemoria_il < public.rome_today() and p.merged_into_id is null
$$;

-- Existing data: rows of prospects already "Non interessato".
update public.opportunities o
set stato_offerta = 'rifiutata', motivo_perdita = coalesce(p.motivo_non_interesse, 'non_indicato')
from public.parties p
where p.id = o.party_id and p.stato_prospect = 'non_interessato' and o.stato_offerta = 'inviata';

update public.opportunities o
set stato_offerta = null
from public.parties p
where p.id = o.party_id and p.stato_prospect = 'non_interessato' and o.stato_offerta = 'da_inviare';

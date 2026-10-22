-- Block 1a-9: the prospect model (spec "Revisione 22/10/2026").
--
-- - parties.stato_prospect: Da contattare (default), Interessato, Molto
--   interessato, Non interessato; motivo_non_interesse optional;
--   ultimo_contatto_il set by hand (empty by default).
-- - opportunities.stato_offerta: a prospect + car park pair is in the
--   pipeline when it has an offer status (null = not in the pipeline); one
--   pipeline row per pair. note and promemoria_il (a date chosen by hand)
--   belong to the pipeline row.
-- - Interessato / Molto interessato: every pair of the prospect enters the
--   pipeline with "Offerta da inviare" (never twice). Back to Da contattare
--   or Non interessato: rows with the offer still to send leave it; rows with
--   an offer sent, accepted or refused stay.
-- - Non interessato closes the open opportunities that are not in the
--   pipeline with an offer.
-- - The offer status drives stage and outcome, so history and older reads
--   stay consistent: to send = Interessata, sent = Offerta inviata, accepted
--   = Vinta, refused = lost with the reason (optional).
-- - The reason of a lost opportunity is optional now: "altro" no longer needs
--   a note, and "non_indicato" stands for no reason.
-- - Telephone, email and contact person shown in the tables are those of the
--   prospect's main contact (the first one created); save_primary_contact()
--   writes them there and creates the contact when there is none.

alter table public.parties
  add column stato_prospect public.prospect_status not null default 'da_contattare',
  add column motivo_non_interesse public.loss_reason,
  add column ultimo_contatto_il date,
  add constraint parties_motivo_non_interesse_check check (motivo_non_interesse is null or stato_prospect = 'non_interessato');

alter table public.opportunities
  add column stato_offerta public.pipeline_offer_status,
  add column note text,
  add column promemoria_il date,
  add constraint opportunities_note_length check (note is null or char_length(note) <= 2000),
  add constraint opportunities_promemoria_in_pipeline check (promemoria_il is null or stato_offerta is not null);

create unique index opportunities_one_pipeline_row_per_pair
  on public.opportunities (party_id, parking_id) where stato_offerta is not null;
create index opportunities_reminders on public.opportunities (promemoria_il) where promemoria_il is not null;
create index parties_stato_prospect on public.parties (stato_prospect) where merged_into_id is null;

-- ---------------------------------------------------------------------------
-- Labels and dates
-- ---------------------------------------------------------------------------

create function public.prospect_status_label(p_stato public.prospect_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_stato
    when 'da_contattare' then 'Da contattare'
    when 'interessato' then 'Interessato'
    when 'molto_interessato' then 'Molto interessato'
    when 'non_interessato' then 'Non interessato'
  end
$$;

create function public.offer_status_label(p_stato public.pipeline_offer_status)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_stato
    when 'da_inviare' then 'Offerta da inviare'
    when 'inviata' then 'Offerta inviata'
    when 'accettata' then 'Accettata'
    when 'rifiutata' then 'Rifiutata'
  end
$$;

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
    when 'non_indicato' then 'motivo non indicato'
  end
$$;

-- The day of an instant in Europe/Rome, today there, and the days from
-- today to a reminder date (negative = overdue).
create function public.rome_day(p_at timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select (p_at at time zone 'Europe/Rome')::date
$$;

create function public.rome_today()
returns date
language sql
stable
set search_path = ''
as $$
  select public.rome_day(now())
$$;

create function public.reminder_days(p_data date)
returns integer
language sql
stable
set search_path = ''
as $$
  select p_data - public.rome_today()
$$;

grant execute on function public.prospect_status_label(public.prospect_status) to authenticated;
grant execute on function public.offer_status_label(public.pipeline_offer_status) to authenticated;
grant execute on function public.rome_day(timestamptz) to authenticated;
grant execute on function public.rome_today() to authenticated;
grant execute on function public.reminder_days(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Rules on opportunities
-- ---------------------------------------------------------------------------

-- The reason of a lost opportunity is optional: "altro" no longer needs a
-- note. The rest is unchanged.
create or replace function public.guard_opportunity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and new.fase in ('passata_bo', 'attivata')
     and (tg_op = 'INSERT' or new.fase is distinct from old.fase)
     and coalesce(current_setting('crm.handoff', true), '') <> 'on' then
    raise exception 'stage % is set by the backoffice handoff', new.fase using errcode = '42501';
  end if;

  if new.esito <> 'persa' then
    new.motivo_perdita := null;
    new.prezzo_concorrente := null;
    new.nota_perdita := null;
  end if;
  return new;
end;
$$;

-- Runs before guard_opportunity (triggers fire in name order).
-- - A new pair of an interested prospect enters the pipeline.
-- - The offer status sets stage and outcome; leaving the pipeline clears the
--   reminder.
create function public.apply_offer_status()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_handoff boolean;
begin
  if tg_op = 'INSERT' and new.stato_offerta is null
     and exists (select 1 from public.parties p
                 where p.id = new.party_id and p.stato_prospect in ('interessato', 'molto_interessato'))
     and not exists (select 1 from public.opportunities o
                     where o.party_id = new.party_id and o.parking_id = new.parking_id and o.stato_offerta is not null) then
    new.stato_offerta := 'da_inviare';
  end if;

  if tg_op = 'UPDATE' and new.stato_offerta is not distinct from old.stato_offerta then
    return new;
  end if;
  if new.stato_offerta is null then
    new.promemoria_il := null;
    return new;
  end if;

  -- Stages of the backoffice handoff are never moved back from here.
  v_handoff := new.fase in ('passata_bo', 'attivata');
  case new.stato_offerta
    when 'da_inviare' then
      new.esito := 'aperta';
      if not v_handoff then new.fase := 'interessata'; end if;
    when 'inviata' then
      new.esito := 'aperta';
      if not v_handoff then new.fase := 'offerta_inviata'; end if;
    when 'accettata' then
      new.esito := 'vinta';
      if not v_handoff then new.fase := 'vinta'; end if;
    when 'rifiutata' then
      new.esito := 'persa';
      new.motivo_perdita := coalesce(new.motivo_perdita, 'non_indicato');
      if not v_handoff then new.fase := 'offerta_inviata'; end if;
  end case;
  return new;
end;
$$;

revoke all on function public.apply_offer_status() from public;

create trigger apply_offer_status
  before insert or update on public.opportunities
  for each row execute function public.apply_offer_status();

-- ---------------------------------------------------------------------------
-- Prospect status
-- ---------------------------------------------------------------------------

-- Sets the status of a prospect and moves its pairs in and out of the
-- pipeline. Returns { entrate, uscite, chiuse }.
create function public.set_prospect_status(
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
      with closed as (
        update public.opportunities set esito = 'persa', motivo_perdita = coalesce(v_motivo, 'non_indicato')
        where party_id = p_party and esito = 'aperta' and stato_offerta is null
        returning 1
      )
      select count(*) into v_closed from closed;
    end if;
  end if;

  return jsonb_build_object('entrate', v_in, 'uscite', v_out, 'chiuse', v_closed);
end;
$$;

grant execute on function public.set_prospect_status(uuid, public.prospect_status, public.loss_reason) to authenticated;

-- ---------------------------------------------------------------------------
-- Offer status
-- ---------------------------------------------------------------------------

-- Offer status of a pipeline row; "rifiutata" with an optional reason.
create function public.set_offer_status(
  p_opportunity uuid,
  p_stato public.pipeline_offer_status,
  p_motivo public.loss_reason default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_stato is null then
    raise exception 'status required' using errcode = '22023';
  end if;
  if p_motivo = 'non_contattare' then
    raise exception '"non_contattare" is set by "do not contact" only' using errcode = '22023';
  end if;
  update public.opportunities
  set stato_offerta = p_stato,
      motivo_perdita = case when p_stato = 'rifiutata' then coalesce(p_motivo, 'non_indicato') else motivo_perdita end
  where id = p_opportunity and stato_offerta is not null;
  if not found then
    raise exception 'not in the pipeline' using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.set_offer_status(uuid, public.pipeline_offer_status, public.loss_reason) to authenticated;

-- ---------------------------------------------------------------------------
-- Car parks of a prospect
-- ---------------------------------------------------------------------------

-- "Togli parcheggio": removes the pair (its opportunities, with their
-- reminders and activities). Refused when an offer was sent (23514) or an
-- email was recorded (23503): those stay in the history. Every active user
-- can do it (operators cannot delete rows directly); the audit records it.
create function public.remove_parking_from_prospect(p_party uuid, p_parking uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.opportunities
             where party_id = p_party and parking_id = p_parking and stato_offerta in ('inviata', 'accettata', 'rifiutata')) then
    raise exception 'an offer was sent on this car park' using errcode = '23514';
  end if;
  if exists (select 1 from public.communications c join public.opportunities o on o.id = c.opportunity_id
             where o.party_id = p_party and o.parking_id = p_parking) then
    raise exception 'emails are recorded on this car park' using errcode = '23503';
  end if;
  delete from public.opportunities where party_id = p_party and parking_id = p_parking;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'car park not found on the prospect' using errcode = 'P0002';
  end if;
  return v_count;
end;
$$;

revoke all on function public.remove_parking_from_prospect(uuid, uuid) from public;
grant execute on function public.remove_parking_from_prospect(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Main contact
-- ---------------------------------------------------------------------------

-- The main contact of a party: the first one created.
create function public.primary_contact(p_party uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id from public.contacts c where c.party_id = p_party order by c.created_at, c.id limit 1
$$;

grant execute on function public.primary_contact(uuid) to authenticated;

-- Writes telephone, email or contact person ("Nome Cognome": the first word
-- is the first name) on the main contact; creates it when there is none.
-- Returns the contact id (null when there was nothing to write).
create function public.save_primary_contact(p_party uuid, p_campo text, p_valore text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_value text := nullif(btrim(coalesce(p_valore, '')), '');
  v_contact uuid;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_campo not in ('telefono', 'email', 'referente') then
    raise exception 'unknown field' using errcode = '22023';
  end if;
  if not exists (select 1 from public.parties where id = p_party and merged_into_id is null and gdpr_cancellato_il is null) then
    raise exception 'party not found' using errcode = 'P0002';
  end if;
  v_contact := public.primary_contact(p_party);
  if v_contact is null then
    if v_value is null then
      return null;
    end if;
    insert into public.contacts (party_id) values (p_party) returning id into v_contact;
  end if;
  if p_campo = 'telefono' then
    update public.contacts set telefono = v_value where id = v_contact;
  elsif p_campo = 'email' then
    update public.contacts set email = v_value where id = v_contact;
  else
    update public.contacts
    set nome = substring(v_value from '^\S+'),
        cognome = nullif(btrim(regexp_replace(coalesce(v_value, ''), '^\S+', '')), '')
    where id = v_contact;
  end if;
  return v_contact;
end;
$$;

grant execute on function public.save_primary_contact(uuid, text, text) to authenticated;

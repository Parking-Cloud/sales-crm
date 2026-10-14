-- Block 1a-6: pipeline, lost outcome, activities, reminders (CRM-16…CRM-20).

-- ---------------------------------------------------------------------------
-- Lost outcome (CRM-17)
-- ---------------------------------------------------------------------------

alter table public.opportunities
  add column nota_perdita text,
  add constraint opportunities_nota_perdita_length check (nota_perdita is null or char_length(nota_perdita) <= 2000);

-- Rules RLS and checks cannot express:
-- - "Passata al BO" and "Attivata" come with the backoffice handoff (block
--   1b): API users cannot set them (the handoff code will set crm.handoff);
-- - lost with reason "altro" needs a note (imports are exempt: the Excel
--   gives no note); reopening clears the loss fields.
create function public.guard_opportunity()
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
  elsif new.motivo_perdita = 'altro'
        and new.import_batch_id is null
        and nullif(btrim(coalesce(new.nota_perdita, '')), '') is null
        and (tg_op = 'INSERT' or new.esito is distinct from old.esito or new.motivo_perdita is distinct from old.motivo_perdita
             or new.nota_perdita is distinct from old.nota_perdita) then
    raise exception 'reason "altro" needs a note' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger guard_opportunity
  before insert or update on public.opportunities
  for each row execute function public.guard_opportunity();

-- ---------------------------------------------------------------------------
-- Stage and outcome changes in the history (CRM-20)
-- ---------------------------------------------------------------------------

create function public.stage_label(p_fase public.opportunity_stage)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_fase
    when 'individuata' then 'Individuata'
    when 'da_contattare' then 'Da contattare'
    when 'contattata' then 'Contattata'
    when 'interessata' then 'Interessata'
    when 'offerta_inviata' then 'Offerta inviata'
    when 'vinta' then 'Vinta'
    when 'passata_bo' then 'Passata al BO'
    when 'attivata' then 'Attivata'
  end
$$;

create function public.loss_reason_label(p_reason public.loss_reason)
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
  end
$$;

-- One "cambio_fase" activity per change of stage or outcome, with the author.
-- Changes made by an import in the same transaction that created the
-- opportunity are not logged (the import is the origin).
create function public.log_opportunity_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_text text;
begin
  if new.fase is not distinct from old.fase and new.esito is not distinct from old.esito then
    return null;
  end if;
  if new.import_batch_id is not null and old.created_at = now() then
    return null;
  end if;

  if new.esito is distinct from old.esito then
    v_text := case new.esito
      when 'persa' then 'Chiusa come persa: ' || coalesce(public.loss_reason_label(new.motivo_perdita), 'motivo non indicato')
        || case when new.prezzo_concorrente is not null then ' (prezzo del concorrente ' || replace(new.prezzo_concorrente::text, '.', ',') || ' €)' else '' end
        || case when new.nota_perdita is not null then '. ' || new.nota_perdita else '' end
      when 'vinta' then 'Chiusa come vinta'
      else 'Riaperta in fase ' || public.stage_label(new.fase)
    end;
  else
    v_text := 'Fase: ' || public.stage_label(old.fase) || ' → ' || public.stage_label(new.fase);
  end if;

  insert into public.activities (opportunity_id, party_id, user_id, tipo, testo)
  values (new.id, new.party_id, auth.uid(), 'cambio_fase', v_text);
  return null;
end;
$$;

revoke all on function public.log_opportunity_change() from public;

create trigger log_opportunity_change
  after update on public.opportunities
  for each row execute function public.log_opportunity_change();

-- ---------------------------------------------------------------------------
-- Activities and reminders (CRM-18, CRM-19)
-- ---------------------------------------------------------------------------

-- Call outcomes. Imported and older activities have none.
alter table public.activities
  add constraint activities_esito_check check (esito is null or esito in ('risposto', 'non_risponde', 'numero_errato', 'richiamare'));

-- A reminder ("prossima attività") is a task with a type and a due date,
-- on an opportunity or on a party.
alter table public.tasks
  add column tipo public.activity_type not null default 'chiamata',
  add column party_id uuid references public.parties (id) on delete cascade,
  add column nota text,
  alter column assegnatario_id set default auth.uid(),
  add constraint tasks_has_subject check (opportunity_id is not null or party_id is not null),
  add constraint tasks_tipo_check check (tipo in ('chiamata', 'email', 'incontro', 'nota'));

create index tasks_open_by_user on public.tasks (assegnatario_id, scadenza) where completata_il is null;
create index tasks_open_by_opportunity on public.tasks (opportunity_id, scadenza) where completata_il is null;

-- opportunities.prossima_attivita_il = earliest open reminder.
create function public.sync_next_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  v_ids := array_remove(array[
    case when tg_op <> 'DELETE' then new.opportunity_id end,
    case when tg_op <> 'INSERT' then old.opportunity_id end
  ], null);
  update public.opportunities o
  set prossima_attivita_il = (
    select min(t.scadenza) from public.tasks t
    where t.opportunity_id = o.id and t.completata_il is null and t.scadenza is not null
  )
  where o.id = any (v_ids)
    and o.prossima_attivita_il is distinct from (
      select min(t.scadenza) from public.tasks t
      where t.opportunity_id = o.id and t.completata_il is null and t.scadenza is not null
    );
  return null;
end;
$$;

revoke all on function public.sync_next_activity() from public;

create trigger sync_next_activity
  after insert or update or delete on public.tasks
  for each row execute function public.sync_next_activity();

-- Records an activity (a call in 2 clicks) and, if given, the next one.
-- "richiamare" needs the date of the next activity. Opportunity or party.
-- Returns { activity_id, task_id, proponi_contattata }: true when the first
-- answered call is on an opportunity still "Individuata" or "Da contattare".
create function public.log_activity(
  p_opportunity uuid,
  p_party uuid,
  p_tipo public.activity_type,
  p_esito text default null,
  p_testo text default null,
  p_prossima_il timestamptz default null,
  p_prossima_tipo public.activity_type default 'chiamata',
  p_prossima_nota text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_party uuid := p_party;
  v_stage public.opportunity_stage;
  v_activity uuid;
  v_task uuid;
  v_first boolean;
begin
  if not public.is_active_user() then
    raise exception 'not an active user' using errcode = '42501';
  end if;
  if p_tipo = 'cambio_fase' then
    raise exception 'stage changes are recorded automatically' using errcode = '22023';
  end if;
  if p_esito = 'richiamare' and p_prossima_il is null then
    raise exception '"richiamare" needs the date of the next activity' using errcode = '23514';
  end if;
  if p_opportunity is not null then
    select party_id, fase into v_party, v_stage from public.opportunities where id = p_opportunity;
    if v_party is null then
      raise exception 'opportunity not found' using errcode = 'P0002';
    end if;
  elsif v_party is null then
    raise exception 'opportunity or party required' using errcode = '22023';
  end if;

  v_first := p_tipo = 'chiamata' and p_esito = 'risposto' and p_opportunity is not null
    and v_stage in ('individuata', 'da_contattare')
    and not exists (select 1 from public.activities
                    where opportunity_id = p_opportunity and tipo = 'chiamata' and esito = 'risposto');

  insert into public.activities (opportunity_id, party_id, tipo, esito, testo)
  values (p_opportunity, v_party, p_tipo, case when p_tipo = 'chiamata' then p_esito end, nullif(btrim(coalesce(p_testo, '')), ''))
  returning id into v_activity;

  if p_prossima_il is not null then
    insert into public.tasks (opportunity_id, party_id, tipo, titolo, scadenza, nota)
    values (p_opportunity, v_party, coalesce(p_prossima_tipo, 'chiamata'),
            case coalesce(p_prossima_tipo, 'chiamata')
              when 'chiamata' then 'Chiamare' when 'email' then 'Scrivere' when 'incontro' then 'Incontro' else 'Promemoria' end,
            p_prossima_il, nullif(btrim(coalesce(p_prossima_nota, '')), ''))
    returning id into v_task;
  end if;

  return jsonb_build_object('activity_id', v_activity, 'task_id', v_task, 'proponi_contattata', v_first);
end;
$$;

grant execute on function public.log_activity(uuid, uuid, public.activity_type, text, text, timestamptz, public.activity_type, text) to authenticated;

-- "Fatta": the reminder is completed and becomes an activity (with the call
-- outcome), optionally with the next one.
create function public.complete_task(
  p_task uuid,
  p_esito text default null,
  p_testo text default null,
  p_prossima_il timestamptz default null,
  p_prossima_tipo public.activity_type default 'chiamata'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t public.tasks;
  v_result jsonb;
begin
  select * into t from public.tasks where id = p_task for update;
  if t.id is null then
    raise exception 'reminder not found' using errcode = 'P0002';
  end if;
  if t.completata_il is not null then
    raise exception 'reminder already done' using errcode = '22023';
  end if;
  v_result := public.log_activity(t.opportunity_id, t.party_id, t.tipo, p_esito,
                                  coalesce(nullif(btrim(coalesce(p_testo, '')), ''), t.nota), p_prossima_il, p_prossima_tipo);
  update public.tasks set completata_il = now() where id = p_task;
  return v_result;
end;
$$;

grant execute on function public.complete_task(uuid, text, text, timestamptz, public.activity_type) to authenticated;

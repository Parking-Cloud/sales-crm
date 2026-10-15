-- Block 1a-8, part B: light cadences. Nothing is sent automatically: each
-- step is a reminder (task) in "Oggi" for the owner of the enrollment.
--
-- cadences: name, description, archived or not, author.
-- cadence_steps: ordered steps; type (chiamata, email, attivita), wait from
--   the previous step in working days (Monday to Friday, Europe/Rome; the
--   first step may wait 0), suggested time, template (required for emails,
--   by template: its active version is used), instructions. A step already
--   used by an enrollment cannot be changed, moved or deleted.
-- cadence_enrollments: opportunity + contact + owner + start day + state
--   (attiva, in_pausa, completata, fermata with reason). One active (or
--   paused) enrollment per opportunity.
-- Execution: the current step is an open task; completing it creates the
-- next one (due = completion day + wait, at the suggested time).
-- Automatic stops, with the reason in the history: opportunity closed (lost
-- or won), "do not contact", stage "Interessata" or later ("convertito").
-- Holidays are not considered: only weekends.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.cadences (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descrizione text,
  archiviata_il timestamptz,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cadences_nome_length check (char_length(btrim(nome)) between 1 and 120),
  constraint cadences_descrizione_length check (descrizione is null or char_length(descrizione) <= 1000)
);

create table public.cadence_steps (
  id uuid primary key default gen_random_uuid(),
  cadence_id uuid not null references public.cadences (id) on delete cascade,
  posizione integer not null,
  tipo text not null,
  attesa_giorni integer not null default 0,
  orario time,
  template_famiglia_id uuid,
  istruzioni text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cadence_steps_position unique (cadence_id, posizione) deferrable initially deferred,
  constraint cadence_steps_posizione_positive check (posizione > 0),
  constraint cadence_steps_tipo_check check (tipo in ('chiamata', 'email', 'attivita')),
  constraint cadence_steps_attesa_check check (attesa_giorni between 0 and 60),
  constraint cadence_steps_email_template check (tipo <> 'email' or template_famiglia_id is not null),
  constraint cadence_steps_istruzioni_length check (istruzioni is null or char_length(istruzioni) <= 1000)
);

create table public.cadence_enrollments (
  id uuid primary key default gen_random_uuid(),
  cadence_id uuid not null references public.cadences (id),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  responsabile_id uuid references public.users (id) on update cascade on delete set null,
  avvio date not null,
  stato text not null default 'attiva',
  -- Current step (the one with the open task, or where it paused).
  step_id uuid references public.cadence_steps (id) on delete set null,
  -- How it ended, for the statistics: risposto, convertito, chiusa,
  -- non_contattare, manuale.
  esito text,
  motivo_stop text,
  terminata_il timestamptz,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cadence_enrollments_stato_check check (stato in ('attiva', 'in_pausa', 'completata', 'fermata')),
  constraint cadence_enrollments_esito_check check (esito is null or esito in ('risposto', 'convertito', 'chiusa', 'non_contattare', 'manuale')),
  constraint cadence_enrollments_stop_reason check (stato <> 'fermata' or (esito is not null and nullif(btrim(motivo_stop), '') is not null))
);

create unique index cadence_enrollments_one_active on public.cadence_enrollments (opportunity_id) where stato in ('attiva', 'in_pausa');
create index cadence_enrollments_cadence on public.cadence_enrollments (cadence_id, stato);
create index cadence_enrollments_contact on public.cadence_enrollments (contact_id) where stato in ('attiva', 'in_pausa');

alter table public.tasks
  add column cadence_enrollment_id uuid references public.cadence_enrollments (id) on delete cascade,
  add column cadence_step_id uuid references public.cadence_steps (id) on delete set null;

create index tasks_cadence_enrollment on public.tasks (cadence_enrollment_id) where cadence_enrollment_id is not null;
create index tasks_cadence_step on public.tasks (cadence_step_id) where cadence_step_id is not null;

create trigger set_updated_at before update on public.cadences for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.cadence_steps for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.cadence_enrollments for each row execute function public.set_updated_at();
create trigger audit_row_change after insert or update or delete on public.cadences for each row execute function public.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.cadence_steps for each row execute function public.audit_row_change();
create trigger audit_row_change after insert or update or delete on public.cadence_enrollments for each row execute function public.audit_row_change();

-- ---------------------------------------------------------------------------
-- Working days
-- ---------------------------------------------------------------------------

-- p_day plus p_days working days (Monday to Friday); a result on a weekend
-- moves to Monday, so 0 days from a Saturday is the next Monday.
create function public.add_business_days(p_day date, p_days integer)
returns date
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  d date := p_day;
  n integer := greatest(coalesce(p_days, 0), 0);
begin
  while extract(isodow from d) > 5 loop
    d := d + 1;
  end loop;
  while n > 0 loop
    d := d + 1;
    if extract(isodow from d) <= 5 then
      n := n - 1;
    end if;
  end loop;
  return d;
end;
$$;

grant execute on function public.add_business_days(date, integer) to authenticated;

-- Due time of a step: working days after p_day, at the suggested time
-- (09:00 when none), Europe/Rome.
create function public.cadence_step_due(p_day date, p_attesa integer, p_orario time)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select ((public.add_business_days(p_day, p_attesa) + coalesce(p_orario, time '09:00'))::timestamp at time zone 'Europe/Rome')
$$;

-- ---------------------------------------------------------------------------
-- Steps: used steps are locked
-- ---------------------------------------------------------------------------

create function public.cadence_step_used(p_step uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.tasks t where t.cadence_step_id = p_step)
      or exists (select 1 from public.cadence_enrollments e where e.step_id = p_step)
$$;

grant execute on function public.cadence_step_used(uuid) to authenticated;

create function public.guard_cadence_step()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_last_used integer;
begin
  if tg_op in ('UPDATE', 'DELETE') and public.cadence_step_used(old.id) then
    if tg_op = 'DELETE' or (new.posizione, new.tipo, new.attesa_giorni, new.orario, new.template_famiglia_id, new.istruzioni)
       is distinct from (old.posizione, old.tipo, old.attesa_giorni, old.orario, old.template_famiglia_id, old.istruzioni) then
      raise exception 'a step already used by an enrollment cannot be changed' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  -- New and moved steps go after every used step.
  select max(s.posizione) into v_last_used
  from public.cadence_steps s
  where s.cadence_id = new.cadence_id and s.id <> new.id and public.cadence_step_used(s.id);
  if v_last_used is not null and new.posizione <= v_last_used
     and (tg_op = 'INSERT' or new.posizione is distinct from old.posizione) then
    raise exception 'steps already used come first' using errcode = '42501';
  end if;
  if new.template_famiglia_id is not null
     and not exists (select 1 from public.email_templates t where t.famiglia_id = new.template_famiglia_id) then
    raise exception 'template not found' using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_cadence_step() from public;

create trigger guard_cadence_step
  before insert or update or delete on public.cadence_steps
  for each row execute function public.guard_cadence_step();

-- ---------------------------------------------------------------------------
-- Execution
-- ---------------------------------------------------------------------------

-- Creates the task of a step for an enrollment, due p_day + wait.
create function public.cadence_create_task(p_enrollment uuid, p_step uuid, p_day date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.cadence_enrollments;
  s public.cadence_steps;
  v_name text;
  v_total integer;
  v_party uuid;
  v_id uuid;
begin
  select * into e from public.cadence_enrollments where id = p_enrollment;
  select * into s from public.cadence_steps where id = p_step;
  select c.nome, (select count(*) from public.cadence_steps x where x.cadence_id = c.id)
  into v_name, v_total from public.cadences c where c.id = e.cadence_id;
  select o.party_id into v_party from public.opportunities o where o.id = e.opportunity_id;
  insert into public.tasks (opportunity_id, party_id, assegnatario_id, tipo, titolo, scadenza, nota, cadence_enrollment_id, cadence_step_id, created_by)
  values (e.opportunity_id, v_party, e.responsabile_id,
          case s.tipo when 'attivita' then 'nota' else s.tipo end::public.activity_type,
          left(v_name, 120) || ' · passo ' || s.posizione || '/' || v_total,
          public.cadence_step_due(p_day, s.attesa_giorni, s.orario),
          s.istruzioni, e.id, s.id, auth.uid())
  returning id into v_id;
  update public.cadence_enrollments set step_id = s.id where id = e.id;
  return v_id;
end;
$$;

revoke all on function public.cadence_create_task(uuid, uuid, date) from public;
-- Called by the enrollment functions, which run as the user.
grant execute on function public.cadence_create_task(uuid, uuid, date) to authenticated;

-- A line in the history of the opportunity.
create function public.cadence_log(p_enrollment uuid, p_text text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activities (opportunity_id, party_id, user_id, tipo, testo)
  select e.opportunity_id, o.party_id, auth.uid(), 'nota', 'Cadenza "' || c.nome || '": ' || p_text
  from public.cadence_enrollments e
  join public.opportunities o on o.id = e.opportunity_id
  join public.cadences c on c.id = e.cadence_id
  where e.id = p_enrollment
$$;

revoke all on function public.cadence_log(uuid, text) from public;
-- Called by the enrollment functions, which run as the user.
grant execute on function public.cadence_log(uuid, text) to authenticated;

-- Completing the task of a step creates the next one (completion day +
-- wait); after the last step the enrollment is completed.
create function public.cadence_advance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.cadence_enrollments;
  v_current integer;
  v_next uuid;
begin
  if new.cadence_enrollment_id is null or old.completata_il is not null or new.completata_il is null then
    return null;
  end if;
  select * into e from public.cadence_enrollments where id = new.cadence_enrollment_id;
  if e.stato <> 'attiva' then
    return null;
  end if;
  select posizione into v_current from public.cadence_steps where id = new.cadence_step_id;
  select s.id into v_next from public.cadence_steps s
  where s.cadence_id = e.cadence_id and s.posizione > coalesce(v_current, 0)
  order by s.posizione limit 1;
  if v_next is null then
    update public.cadence_enrollments set stato = 'completata', terminata_il = now() where id = e.id;
    perform public.cadence_log(e.id, 'completata');
  else
    perform public.cadence_create_task(e.id, v_next, (new.completata_il at time zone 'Europe/Rome')::date);
  end if;
  return null;
end;
$$;

revoke all on function public.cadence_advance() from public;

create trigger cadence_advance
  after update of completata_il on public.tasks
  for each row execute function public.cadence_advance();

-- Stops an enrollment: open tasks removed, reason in the history.
create function public.cadence_stop_internal(p_enrollment uuid, p_esito text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cadence_enrollments
  set stato = 'fermata', esito = p_esito, motivo_stop = p_motivo, terminata_il = now()
  where id = p_enrollment and stato in ('attiva', 'in_pausa');
  if found then
    delete from public.tasks where cadence_enrollment_id = p_enrollment and completata_il is null;
    perform public.cadence_log(p_enrollment, 'fermata. ' || p_motivo);
  end if;
end;
$$;

revoke all on function public.cadence_stop_internal(uuid, text, text) from public;
-- Called by the enrollment functions, which run as the user.
grant execute on function public.cadence_stop_internal(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Enrollment (B3)
-- ---------------------------------------------------------------------------

-- Enrolls opportunities: p_items = [{ "opportunity_id": ..., "contact_id": ... }]
-- (contact optional: the opportunity's, or the first contact of the party
-- that can be contacted). Skipped with the reason: closed opportunity,
-- already in a cadence, "do not contact" or suppression list, no contact.
create function public.enroll_in_cadence(p_cadence uuid, p_items jsonb, p_avvio date)
returns table (opportunity_id uuid, esito text, motivo text, enrollment_id uuid, contact_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item jsonb;
  o public.opportunities;
  p public.parties;
  v_contact uuid;
  v_first uuid;
  v_id uuid;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cadences c where c.id = p_cadence and c.archiviata_il is null) then
    raise exception 'cadence not found or archived' using errcode = 'P0002';
  end if;
  select s.id into v_first from public.cadence_steps s where s.cadence_id = p_cadence order by s.posizione limit 1;
  if v_first is null then
    raise exception 'the cadence has no steps' using errcode = '22023';
  end if;
  if p_avvio is null then
    raise exception 'start day required' using errcode = '22023';
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    opportunity_id := (item ->> 'opportunity_id')::uuid;
    enrollment_id := null;
    contact_id := null;
    select * into o from public.opportunities x where x.id = opportunity_id;
    if o.id is null then
      esito := 'saltata'; motivo := 'Opportunità non trovata'; return next; continue;
    end if;
    select * into p from public.parties x where x.id = o.party_id;
    if o.esito <> 'aperta' then
      esito := 'saltata'; motivo := 'Opportunità chiusa'; return next; continue;
    end if;
    if exists (select 1 from public.cadence_enrollments x where x.opportunity_id = o.id and x.stato in ('attiva', 'in_pausa')) then
      esito := 'saltata'; motivo := 'Già in una cadenza'; return next; continue;
    end if;
    if p.non_contattare or p.gdpr_cancellato_il is not null
       or public.is_suppressed(array[p.email, p.telefono, p.dominio, p.piva]) then
      esito := 'saltata'; motivo := 'Soggetto da non contattare o in lista di esclusione'; return next; continue;
    end if;
    v_contact := nullif(item ->> 'contact_id', '')::uuid;
    if v_contact is null then
      select c.id into v_contact
      from public.contacts c
      where c.party_id = p.id and not c.non_contattare
        and not public.is_suppressed(array[c.email] || regexp_split_to_array(coalesce(c.telefono, ''), '\s*,\s*'))
      order by (c.id = o.contact_id) desc, (c.email is not null) desc, (c.telefono is not null) desc, c.created_at
      limit 1;
    elsif not exists (
      select 1 from public.contacts c
      where c.id = v_contact and c.party_id = p.id and not c.non_contattare
        and not public.is_suppressed(array[c.email] || regexp_split_to_array(coalesce(c.telefono, ''), '\s*,\s*'))
    ) then
      esito := 'saltata'; motivo := 'Contatto da non contattare o in lista di esclusione'; return next; continue;
    end if;
    if v_contact is null then
      esito := 'saltata'; motivo := 'Nessun contatto'; return next; continue;
    end if;
    begin
      insert into public.cadence_enrollments (cadence_id, opportunity_id, contact_id, responsabile_id, avvio)
      values (p_cadence, o.id, v_contact, coalesce(o.responsabile_id, auth.uid()), p_avvio)
      returning id into v_id;
    exception when unique_violation then
      esito := 'saltata'; motivo := 'Già in una cadenza'; return next; continue;
    end;
    perform public.cadence_create_task(v_id, v_first, p_avvio);
    perform public.cadence_log(v_id, 'iscrizione, avvio il ' || to_char(p_avvio, 'DD/MM/YYYY'));
    esito := 'iscritta'; motivo := null; enrollment_id := v_id; contact_id := v_contact;
    return next;
  end loop;
end;
$$;

grant execute on function public.enroll_in_cadence(uuid, jsonb, date) to authenticated;

-- From the party list: the open opportunity of each party (on p_parking
-- when given). Parties with none, or with several and no car park chosen,
-- are skipped with the reason.
create function public.enroll_parties_in_cadence(p_cadence uuid, p_parties uuid[], p_parking uuid, p_avvio date)
returns table (party_id uuid, opportunity_id uuid, esito text, motivo text, enrollment_id uuid, contact_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_party uuid;
  v_opps uuid[];
  r record;
begin
  foreach v_party in array coalesce(p_parties, '{}') loop
    party_id := v_party;
    select coalesce(array_agg(o.id), '{}') into v_opps
    from public.opportunities o
    where o.party_id = v_party and o.esito = 'aperta' and (p_parking is null or o.parking_id = p_parking);
    if cardinality(v_opps) = 0 then
      opportunity_id := null; enrollment_id := null; contact_id := null; esito := 'saltata';
      motivo := case when p_parking is null then 'Nessuna opportunità aperta' else 'Nessuna opportunità aperta su questo parcheggio' end;
      return next;
    elsif cardinality(v_opps) > 1 then
      opportunity_id := null; enrollment_id := null; contact_id := null; esito := 'saltata';
      motivo := 'Più opportunità aperte: scegli il parcheggio';
      return next;
    else
      select * into r from public.enroll_in_cadence(p_cadence, jsonb_build_array(jsonb_build_object('opportunity_id', v_opps[1])), p_avvio);
      opportunity_id := r.opportunity_id; esito := r.esito; motivo := r.motivo; enrollment_id := r.enrollment_id; contact_id := r.contact_id;
      return next;
    end if;
  end loop;
end;
$$;

grant execute on function public.enroll_parties_in_cadence(uuid, uuid[], uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Pause, resume, stop, skip (B4, B6)
-- ---------------------------------------------------------------------------

-- Open tasks of an enrollment (deleting tasks is otherwise for admins).
create function public.cadence_clear_open_tasks(p_enrollment uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.tasks where cadence_enrollment_id = p_enrollment and completata_il is null
$$;

revoke all on function public.cadence_clear_open_tasks(uuid) from public;
-- Called by the enrollment functions, which run as the user.
grant execute on function public.cadence_clear_open_tasks(uuid) to authenticated;

create function public.pause_cadence(p_enrollment uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.cadence_enrollments set stato = 'in_pausa' where id = p_enrollment and stato = 'attiva';
  if not found then
    raise exception 'enrollment not active' using errcode = 'P0002';
  end if;
  perform public.cadence_clear_open_tasks(p_enrollment);
  perform public.cadence_log(p_enrollment, 'in pausa');
end;
$$;

-- Resume: the current step again, from today (working days and time of the
-- step's wait are not counted again: due today, or the next working day).
create function public.resume_cadence(p_enrollment uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  e public.cadence_enrollments;
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_orario time;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into e from public.cadence_enrollments where id = p_enrollment and stato = 'in_pausa' for update;
  if e.id is null then
    raise exception 'enrollment not paused' using errcode = 'P0002';
  end if;
  update public.cadence_enrollments set stato = 'attiva' where id = e.id;
  if e.step_id is not null then
    select orario into v_orario from public.cadence_steps where id = e.step_id;
    perform public.cadence_create_task(e.id, e.step_id, v_today);
    -- The wait was already spent before the pause.
    update public.tasks set scadenza = public.cadence_step_due(v_today, 0, v_orario)
    where cadence_enrollment_id = e.id and completata_il is null;
  end if;
  perform public.cadence_log(e.id, 'ripresa');
end;
$$;

-- Manual stop: "risposto" (answered call) or "manuale", with a reason.
create function public.stop_cadence(p_enrollment uuid, p_esito text, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_esito not in ('risposto', 'manuale') then
    raise exception 'unknown stop reason' using errcode = '22023';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'a reason is required' using errcode = '23514';
  end if;
  if not exists (select 1 from public.cadence_enrollments where id = p_enrollment and stato in ('attiva', 'in_pausa')) then
    raise exception 'enrollment not active' using errcode = 'P0002';
  end if;
  perform public.cadence_stop_internal(p_enrollment, p_esito, btrim(p_motivo));
end;
$$;

-- "Salta passo": the step is closed without doing it; the next one starts.
create function public.skip_cadence_step(p_task uuid, p_motivo text default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t public.tasks;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into t from public.tasks where id = p_task and completata_il is null and cadence_enrollment_id is not null for update;
  if t.id is null then
    raise exception 'cadence step not found or already done' using errcode = 'P0002';
  end if;
  perform public.cadence_log(t.cadence_enrollment_id, t.titolo || ' saltato' || coalesce('. ' || nullif(btrim(p_motivo), ''), ''));
  update public.tasks set completata_il = now(), nota = coalesce(nota || ' ', '') || '(passo saltato)' where id = t.id;
end;
$$;

grant execute on function public.pause_cadence(uuid) to authenticated;
grant execute on function public.resume_cadence(uuid) to authenticated;
grant execute on function public.stop_cadence(uuid, text, text) to authenticated;
grant execute on function public.skip_cadence_step(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Automatic stops (B6)
-- ---------------------------------------------------------------------------

create function public.cadence_auto_stop_opportunity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
begin
  for e in select id from public.cadence_enrollments where opportunity_id = new.id and stato in ('attiva', 'in_pausa') loop
    if old.esito = 'aperta' and new.esito <> 'aperta' then
      if new.motivo_perdita = 'non_contattare' then
        perform public.cadence_stop_internal(e.id, 'non_contattare', 'Ha chiesto di non essere contattato');
      else
        perform public.cadence_stop_internal(e.id, 'chiusa', 'Opportunità chiusa come ' || new.esito);
      end if;
    elsif new.fase is distinct from old.fase
          and new.fase in ('interessata', 'offerta_inviata', 'vinta', 'passata_bo', 'attivata')
          and old.fase in ('individuata', 'da_contattare', 'contattata') then
      perform public.cadence_stop_internal(e.id, 'convertito', 'Fase ' || public.stage_label(new.fase) || ': convertito');
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.cadence_auto_stop_opportunity() from public;

create trigger cadence_auto_stop
  after update of esito, fase on public.opportunities
  for each row execute function public.cadence_auto_stop_opportunity();

create function public.cadence_auto_stop_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
begin
  if new.non_contattare and not old.non_contattare then
    for e in select id from public.cadence_enrollments where contact_id = new.id and stato in ('attiva', 'in_pausa') loop
      perform public.cadence_stop_internal(e.id, 'non_contattare', 'Il contatto ha chiesto di non essere contattato');
    end loop;
  end if;
  return null;
end;
$$;

revoke all on function public.cadence_auto_stop_contact() from public;

create trigger cadence_auto_stop
  after update of non_contattare on public.contacts
  for each row execute function public.cadence_auto_stop_contact();

-- ---------------------------------------------------------------------------
-- Email steps: "Segna come inviata" also closes the step (B4, B5)
-- ---------------------------------------------------------------------------

drop function public.record_sent_email(uuid, uuid, uuid, uuid, text, text);

-- As in block 1a-7, plus p_task: the open cadence email step this email
-- completes (same opportunity); the next step starts from it.
create function public.record_sent_email(
  p_party uuid,
  p_contact uuid,
  p_opportunity uuid,
  p_template uuid,
  p_oggetto text,
  p_corpo text,
  p_task uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_check jsonb;
  v_id uuid;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if nullif(btrim(p_oggetto), '') is null or nullif(btrim(p_corpo), '') is null then
    raise exception 'subject and body are required' using errcode = '23514';
  end if;
  if p_opportunity is not null
     and not exists (select 1 from public.opportunities o where o.id = p_opportunity and o.party_id = p_party) then
    raise exception 'opportunity of another party' using errcode = '22023';
  end if;
  if p_task is not null and not exists (
    select 1 from public.tasks t
    where t.id = p_task and t.completata_il is null and t.cadence_enrollment_id is not null and t.tipo = 'email'
      and t.opportunity_id is not distinct from p_opportunity
  ) then
    raise exception 'cadence email step not found or already done' using errcode = 'P0002';
  end if;
  v_check := public.email_eligibility(p_party, p_contact);

  insert into public.communications (party_id, contact_id, opportunity_id, template_id, a, oggetto, corpo, stato, approvata_da, inviata_il, created_by)
  values (p_party, p_contact, p_opportunity, p_template, v_check ->> 'destinatario', btrim(p_oggetto), p_corpo,
          'inviata', auth.uid(), now(), auth.uid())
  returning id into v_id;

  insert into public.activities (opportunity_id, party_id, contact_id, user_id, tipo, testo, avvenuta_il, communication_id)
  values (p_opportunity, p_party, p_contact, auth.uid(), 'email', 'Email inviata: ' || btrim(p_oggetto), now(), v_id);

  if p_task is not null then
    update public.tasks set completata_il = now() where id = p_task;
  end if;
  return v_id;
end;
$$;

grant execute on function public.record_sent_email(uuid, uuid, uuid, uuid, text, text, uuid) to authenticated;

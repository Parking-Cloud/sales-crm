-- Block 1a-8, part B2: editing steps in one transaction (moving and
-- deleting renumber the positions; the unique position check is deferred
-- to the end of the transaction). Used steps stay locked by the trigger.

-- Moves a step one place up (-1) or down (+1), swapping with its neighbour.
create function public.move_cadence_step(p_step uuid, p_direction integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.cadence_steps;
  v_other public.cadence_steps;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into s from public.cadence_steps where id = p_step for update;
  if s.id is null then
    raise exception 'step not found' using errcode = 'P0002';
  end if;
  select * into v_other from public.cadence_steps
  where cadence_id = s.cadence_id and posizione = s.posizione + sign(p_direction)::integer
  for update;
  if v_other.id is null then
    return;
  end if;
  update public.cadence_steps set posizione = v_other.posizione where id = s.id;
  update public.cadence_steps set posizione = s.posizione where id = v_other.id;
end;
$$;

-- Deletes a step never used; the following ones move up.
create function public.delete_cadence_step(p_step uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.cadence_steps;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into s from public.cadence_steps where id = p_step for update;
  if s.id is null then
    raise exception 'step not found' using errcode = 'P0002';
  end if;
  delete from public.cadence_steps where id = s.id;
  update public.cadence_steps set posizione = posizione - 1 where cadence_id = s.cadence_id and posizione > s.posizione;
end;
$$;

-- Copy of a cadence with its steps, not archived, by the caller.
create function public.duplicate_cadence(p_cadence uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.cadences (nome, descrizione)
  select left(nome || ' (copia)', 120), descrizione from public.cadences where id = p_cadence
  returning id into v_id;
  if v_id is null then
    raise exception 'cadence not found' using errcode = 'P0002';
  end if;
  insert into public.cadence_steps (cadence_id, posizione, tipo, attesa_giorni, orario, template_famiglia_id, istruzioni)
  select v_id, posizione, tipo, attesa_giorni, orario, template_famiglia_id, istruzioni
  from public.cadence_steps where cadence_id = p_cadence;
  return v_id;
end;
$$;

grant execute on function public.move_cadence_step(uuid, integer) to authenticated;
grant execute on function public.delete_cadence_step(uuid) to authenticated;
grant execute on function public.duplicate_cadence(uuid) to authenticated;

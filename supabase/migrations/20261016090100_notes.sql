-- Block 1a-6, A2: free notes on car parks and parties, editable by every
-- active user, with who changed them last and when. parking_facilities.note
-- already exists (block 1a-2) and is reused. Notes are a fixed memo, not
-- activities. Changes go through save_notes(), which touches the note
-- columns only (car parks are otherwise admin-only); the audit triggers of
-- both tables record them.

alter table public.parties
  add column note text,
  add column note_modificate_da uuid references public.users (id) on update cascade on delete set null,
  add column note_modificate_il timestamptz,
  add constraint parties_note_length check (note is null or char_length(note) <= 5000);

alter table public.parking_facilities
  add column note_modificate_da uuid references public.users (id) on update cascade on delete set null,
  add column note_modificate_il timestamptz,
  add constraint parking_facilities_note_length check (note is null or char_length(note) <= 5000);

create function public.save_notes(p_entita text, p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not public.is_active_user() then
    raise exception 'not an active user' using errcode = '42501';
  end if;
  if p_entita = 'parties' then
    update public.parties
    set note = v_note, note_modificate_da = auth.uid(), note_modificate_il = now()
    where id = p_id and merged_into_id is null and note is distinct from v_note;
    if not found and not exists (select 1 from public.parties where id = p_id and merged_into_id is null) then
      raise exception 'party not found' using errcode = 'P0002';
    end if;
  elsif p_entita = 'parking_facilities' then
    update public.parking_facilities
    set note = v_note, note_modificate_da = auth.uid(), note_modificate_il = now()
    where id = p_id and note is distinct from v_note;
    if not found and not exists (select 1 from public.parking_facilities where id = p_id) then
      raise exception 'car park not found' using errcode = 'P0002';
    end if;
  else
    raise exception 'unknown entity' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.save_notes(text, uuid, text) from public;
grant execute on function public.save_notes(text, uuid, text) to authenticated;

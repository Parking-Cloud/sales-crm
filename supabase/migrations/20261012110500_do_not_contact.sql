-- Block 1a-3: "Non contattare" on parties and contacts.
--
-- Setting it (any active user) flags the record and adds its values to the
-- suppression list, with reason and author, in one transaction. Removing it
-- is for administrators only, also when attempted with a direct update.

-- Normalized values that identify a party or a contact for the suppression
-- list: emails, phones and the web domain (generic mail domains excluded).
-- For a party, its contacts' values are included: the whole company opted out.
create function public.do_not_contact_values(p_entita text, p_id uuid)
returns table (tipo public.suppression_type, valore text)
language sql
stable
security invoker
set search_path = ''
as $$
  with contact_rows as (
    select c.email, c.telefono
    from public.contacts c
    where (p_entita = 'contacts' and c.id = p_id)
       or (p_entita = 'parties' and c.party_id = p_id)
  ),
  party_row as (
    select p.email, p.telefono, p.dominio
    from public.parties p
    where p_entita = 'parties' and p.id = p_id
  )
  select distinct v.tipo, v.valore
  from (
    select 'email'::public.suppression_type as tipo, email as valore from party_row
    union all
    select 'telefono', telefono from party_row
    union all
    select 'dominio', dominio from party_row where not public.is_generic_domain(dominio)
    union all
    select 'email', email from contact_rows
    union all
    select 'telefono', btrim(part)
    from contact_rows cross join lateral regexp_split_to_table(coalesce(telefono, ''), ',') as part
  ) v
  where v.valore is not null and v.valore <> ''
$$;

-- Flags a party or contact as "do not contact" and fills the suppression
-- list. Returns the number of values added to the list.
create function public.mark_do_not_contact(p_entita text, p_id uuid, p_motivo text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  added integer;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'a reason is required' using errcode = '23514';
  end if;

  if p_entita = 'parties' then
    update public.parties set non_contattare = true where id = p_id;
  elsif p_entita = 'contacts' then
    update public.contacts set non_contattare = true where id = p_id;
  else
    raise exception 'unknown entity %', p_entita using errcode = '22023';
  end if;
  if not found then
    raise exception 'record not found' using errcode = 'P0002';
  end if;

  insert into public.suppression_list (tipo, valore_normalizzato, motivo)
  select v.tipo, v.valore, btrim(p_motivo)
  from public.do_not_contact_values(p_entita, p_id) v
  on conflict (valore_normalizzato) do nothing;
  get diagnostics added = row_count;
  return added;
end;
$$;

-- Removes the flag and the matching suppression list entries. Administrators
-- only. Returns the number of entries removed from the list.
create function public.clear_do_not_contact(p_entita text, p_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  removed integer;
begin
  if not public.is_admin() then
    raise exception 'only administrators can remove "do not contact"' using errcode = '42501';
  end if;

  delete from public.suppression_list s
  using public.do_not_contact_values(p_entita, p_id) v
  where s.valore_normalizzato = v.valore;
  get diagnostics removed = row_count;

  if p_entita = 'parties' then
    update public.parties set non_contattare = false where id = p_id;
  elsif p_entita = 'contacts' then
    update public.contacts set non_contattare = false where id = p_id;
  else
    raise exception 'unknown entity %', p_entita using errcode = '22023';
  end if;
  return removed;
end;
$$;

grant execute on function public.do_not_contact_values(text, uuid) to authenticated;
grant execute on function public.mark_do_not_contact(text, uuid, text) to authenticated;
grant execute on function public.clear_do_not_contact(text, uuid) to authenticated;

-- Direct updates: only administrators may turn the flag off.
create function public.guard_do_not_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.non_contattare and not new.non_contattare
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'only administrators can remove "do not contact"' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_do_not_contact() from public;

create trigger guard_do_not_contact
  before update on public.parties
  for each row execute function public.guard_do_not_contact();

create trigger guard_do_not_contact
  before update on public.contacts
  for each row execute function public.guard_do_not_contact();

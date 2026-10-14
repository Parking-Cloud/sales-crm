-- users.nome from the Google profile: on the first sign-in and on every
-- later sign-in while nome is empty (a name typed in the CRM is kept).
-- Google gives full_name and name in raw_user_meta_data.

create function public.google_profile_name(meta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(coalesce(nullif(btrim(meta ->> 'full_name'), ''), meta ->> 'name')), '')
$$;

create function public.fill_user_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := public.google_profile_name(new.raw_user_meta_data);
begin
  if v_name is not null then
    update public.users
    set nome = left(v_name, 200)
    where id = new.id
      and (nome is null or btrim(nome) = '');
  end if;
  return new;
end;
$$;

revoke all on function public.fill_user_name() from public;

-- Runs after link_crm_user (triggers fire in name order), so on the first
-- sign-in the CRM row already has the auth id.
create trigger set_crm_user_name
  after insert or update of raw_user_meta_data, last_sign_in_at on auth.users
  for each row execute function public.fill_user_name();

-- Users already signed in.
update public.users u
set nome = left(public.google_profile_name(a.raw_user_meta_data), 200)
from auth.users a
where a.id = u.id
  and (u.nome is null or btrim(u.nome) = '')
  and public.google_profile_name(a.raw_user_meta_data) is not null;

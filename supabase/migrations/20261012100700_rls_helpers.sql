-- Helpers for row level security policies. security definer so they can read
-- public.users regardless of the caller's own policies; search_path is empty
-- and every name is schema-qualified.

-- True when the caller is a linked and active CRM user.
create function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.attivo
  )
$$;

-- True when the caller is a linked, active administrator.
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.attivo
      and u.ruolo = 'admin'
  )
$$;

revoke all on function public.is_active_user() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_active_user() to anon, authenticated, service_role;
grant execute on function public.is_admin() to anon, authenticated, service_role;

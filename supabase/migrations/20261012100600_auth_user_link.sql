-- Link a Supabase Auth account to its CRM user on first sign-in.
-- The allowed list lives in public.users (filled by scripts/sync-allowed-users.ts,
-- never by migrations). If the email is there and active, the CRM row takes
-- the auth id; otherwise nothing is linked and the app refuses access.
-- Emails are compared in lower case.

create function public.link_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users
  set id = new.id
  where email = lower(btrim(new.email))
    and attivo
    and id <> new.id;
  return new;
end;
$$;

revoke all on function public.link_auth_user() from public;

create trigger link_crm_user
  after insert on auth.users
  for each row execute function public.link_auth_user();

-- Application settings as key/value pairs, generic for future settings.
-- Read by every active user, written by administrators, audited.
-- Values are jsonb; each key gets its own check constraint.
create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  chiave text not null unique,
  valore jsonb not null,
  updated_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_settings_chiave_not_blank check (btrim(chiave) <> ''),
  -- Maximum distance of the car parks shown for a location: 500 m to 20 km.
  constraint app_settings_distanza_massima check (
    chiave <> 'distanza_massima_parcheggi_m'
    or (jsonb_typeof(valore) = 'number'
        and valore::text ~ '^\d+$'
        and valore::text::integer between 500 and 20000)
  )
);

create index app_settings_updated_by on public.app_settings (updated_by);

create trigger set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

-- Keep the author of the latest change.
create function public.app_settings_set_updated_by()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger set_updated_by before update on public.app_settings
  for each row execute function public.app_settings_set_updated_by();

create trigger audit_row_change after insert or update or delete on public.app_settings
  for each row execute function public.audit_row_change();

alter table public.app_settings enable row level security;

grant select on public.app_settings to anon;
grant select, insert, update, delete on public.app_settings to authenticated;

create policy read_active_users on public.app_settings
  for select to authenticated using (public.is_active_user());
create policy insert_admin on public.app_settings
  for insert to authenticated with check (public.is_admin());
create policy update_admin on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy delete_admin on public.app_settings
  for delete to authenticated using (public.is_admin());

insert into public.app_settings (chiave, valore)
values ('distanza_massima_parcheggi_m', '5000'::jsonb);

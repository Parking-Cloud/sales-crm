-- Block 1a-4: column mappings saved with a name (CRM-13). Read by every
-- active user, written by administrators (the import is admin-only).
create table public.import_mappings (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  tipo_foglio text not null,
  mappatura jsonb not null,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint import_mappings_tipo_foglio check (tipo_foglio in ('anagrafica', 'prospect')),
  constraint import_mappings_nome_not_blank check (btrim(nome) <> '')
);

create index import_mappings_created_by on public.import_mappings (created_by);

create trigger set_updated_at before update on public.import_mappings
  for each row execute function public.set_updated_at();

alter table public.import_mappings enable row level security;

grant select on public.import_mappings to anon;
grant select, insert, update, delete on public.import_mappings to authenticated;

create policy read_active_users on public.import_mappings
  for select to authenticated using (public.is_active_user());
create policy insert_admin on public.import_mappings
  for insert to authenticated with check (public.is_admin());
create policy update_admin on public.import_mappings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy delete_admin on public.import_mappings
  for delete to authenticated using (public.is_admin());

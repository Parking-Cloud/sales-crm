-- Block 1a-8: policies of the cadence tables (own migration, as for every
-- RLS change). Every active user reads, creates and changes cadences, steps
-- and enrollments (the team is small and everyone works on every
-- opportunity); deletions are for administrators. Cadences are archived
-- rather than deleted; steps already used cannot be deleted (trigger).

alter table public.cadences enable row level security;
alter table public.cadence_steps enable row level security;
alter table public.cadence_enrollments enable row level security;

create policy read_active_users on public.cadences for select to authenticated using (public.is_active_user());
create policy insert_active_users on public.cadences for insert to authenticated with check (public.is_active_user());
create policy update_active_users on public.cadences for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy delete_admin on public.cadences for delete to authenticated using (public.is_admin());

create policy read_active_users on public.cadence_steps for select to authenticated using (public.is_active_user());
create policy insert_active_users on public.cadence_steps for insert to authenticated with check (public.is_active_user());
create policy update_active_users on public.cadence_steps for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy delete_active_users on public.cadence_steps for delete to authenticated using (public.is_active_user());

create policy read_active_users on public.cadence_enrollments for select to authenticated using (public.is_active_user());
create policy insert_active_users on public.cadence_enrollments for insert to authenticated with check (public.is_active_user());
create policy update_active_users on public.cadence_enrollments for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy delete_admin on public.cadence_enrollments for delete to authenticated using (public.is_admin());

grant select, insert, update, delete on public.cadences, public.cadence_steps, public.cadence_enrollments to authenticated;

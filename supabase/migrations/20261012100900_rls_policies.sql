-- Row level security on every table.
--
-- - Read: any authenticated user who is linked and active.
-- - Write (insert, update): administrators and operators on operational tables;
--   administrators only on users, data_sources and email_templates.
-- - Physical delete: administrators only (operators archive or close).
-- - audit_logs: read only (rows come from the audit trigger).
-- - import_batches: read and insert; never update or delete.
-- - Anonymous: table access is granted so the API answers, but no policy
--   targets anon, so every query returns zero rows.
-- Prices in parking_products are guarded by guard_product_prices().

-- ---------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Append-only tables: no direct insert into the audit log, no update or delete anywhere.
revoke insert on public.audit_logs from authenticated;
revoke update, delete, truncate on public.audit_logs from authenticated, service_role;
revoke update, delete, truncate on public.import_batches from authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Policies
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  operational text[] := array[
    'parking_facilities',
    'parking_products',
    'parties',
    'party_locations',
    'contacts',
    'campaigns',
    'campaign_recipients',
    'opportunities',
    'activities',
    'tasks',
    'communications',
    'offers',
    'offer_items',
    'backoffice_handoffs',
    'external_references',
    'field_provenance',
    'contact_permissions',
    'suppression_list'
  ];
  admin_managed text[] := array['users', 'data_sources', 'email_templates'];
  append_only text[] := array['audit_logs', 'import_batches'];
begin
  -- Every table: RLS on, read for active users, delete for administrators
  -- (except append-only tables).
  foreach t in array operational || admin_managed || append_only
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy read_active_users on public.%I
         for select to authenticated
         using (public.is_active_user())',
      t
    );
  end loop;

  foreach t in array operational || admin_managed
  loop
    execute format(
      'create policy delete_admin on public.%I
         for delete to authenticated
         using (public.is_admin())',
      t
    );
  end loop;

  foreach t in array operational
  loop
    execute format(
      'create policy insert_active_users on public.%I
         for insert to authenticated
         with check (public.is_active_user())',
      t
    );
    execute format(
      'create policy update_active_users on public.%I
         for update to authenticated
         using (public.is_active_user())
         with check (public.is_active_user())',
      t
    );
  end loop;

  foreach t in array admin_managed
  loop
    execute format(
      'create policy insert_admin on public.%I
         for insert to authenticated
         with check (public.is_admin())',
      t
    );
    execute format(
      'create policy update_admin on public.%I
         for update to authenticated
         using (public.is_admin())
         with check (public.is_admin())',
      t
    );
  end loop;
end;
$$;

-- An import batch is recorded by the user who runs it.
create policy insert_own_batch on public.import_batches
  for insert to authenticated
  with check (public.is_active_user() and utente_id = auth.uid());

-- Safety net: fail the migration if any public table is left without RLS.
do $$
declare
  missing text;
begin
  select string_agg(c.relname, ', ')
  into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if missing is not null then
    raise exception 'row level security is not enabled on: %', missing;
  end if;
end;
$$;

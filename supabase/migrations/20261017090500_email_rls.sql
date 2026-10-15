-- Block 1a-7: policies for templates, communications, permissions and the
-- suppression list (in their own migration, as for every RLS change).
--
-- - email_templates: versions are kept, so no deletion (the trigger already
--   refuses changes to a saved version; "attivo" stays editable by admins).
-- - communications: written only as new rows (record_sent_email); once
--   saved they are not changed through the API.
-- - contact_permissions: written only by register_email_permission(), which
--   checks the basis, the address and the suppression list; revoking a
--   permission (stato) is for administrators.
-- - suppression_list: no hard deletion; removal is soft, with a reason
--   (remove_suppression, administrators only).

drop policy delete_admin on public.email_templates;

drop policy update_active_users on public.communications;

drop policy insert_active_users on public.contact_permissions;
drop policy update_active_users on public.contact_permissions;
create policy update_admin on public.contact_permissions
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy delete_admin on public.suppression_list;

-- register_email_permission() writes as its owner, after its own checks.
alter function public.register_email_permission(uuid, uuid, public.permission_basis, text, timestamptz, text, text) security definer;
revoke all on function public.register_email_permission(uuid, uuid, public.permission_basis, text, timestamptz, text, text) from public;
grant execute on function public.register_email_permission(uuid, uuid, public.permission_basis, text, timestamptz, text, text) to authenticated;

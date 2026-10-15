-- Block 1a-8: the contacts export is a generic CSV, not tied to one tool.
-- export_party_rows(): same rows and columns as before, new name.
-- log_csv_export(): the export in the audit as "esportazione_csv" (who,
-- when, how many rows), without the data. Audit rows already written keep
-- their entity (append-only).

alter function public.crono_export_rows(uuid[], uuid) rename to export_party_rows;

drop function public.log_crono_export(integer, integer);

create function public.log_csv_export(p_righe integer, p_escluse integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.audit_logs (utente_id, entita, entita_id, azione, prima, dopo)
  values (auth.uid(), 'esportazione_csv', null, 'insert', null,
          jsonb_build_object('righe_esportate', greatest(coalesce(p_righe, 0), 0), 'righe_escluse', greatest(coalesce(p_escluse, 0), 0)));
end;
$$;

revoke all on function public.log_csv_export(integer, integer) from public;
grant execute on function public.log_csv_export(integer, integer) to authenticated;

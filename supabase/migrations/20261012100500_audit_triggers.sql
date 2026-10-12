-- Generic audit trigger: one row in audit_logs per insert, update or delete,
-- with the acting user (auth.uid(), null for direct database sessions), the
-- table, the row id and the values before and after.

create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_values jsonb;
  after_values jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    before_values := to_jsonb(old);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    after_values := to_jsonb(new);
  end if;

  -- Skip updates that change nothing.
  if tg_op = 'UPDATE' and before_values = after_values then
    return null;
  end if;

  insert into public.audit_logs (utente_id, entita, entita_id, azione, prima, dopo)
  values (
    auth.uid(),
    tg_table_name,
    coalesce(after_values ->> 'id', before_values ->> 'id')::uuid,
    lower(tg_op)::public.audit_action,
    before_values,
    after_values
  );

  return null;
end;
$$;

-- Trigger function only: nobody calls it directly.
revoke all on function public.audit_row_change() from public;

do $$
declare
  t text;
begin
  foreach t in array array[
    'parking_facilities',
    'parking_products',
    'parties',
    'contacts',
    'opportunities',
    'offers',
    'offer_items',
    'backoffice_handoffs',
    'suppression_list',
    'users'
  ]
  loop
    execute format(
      'create trigger audit_row_change after insert or update or delete on public.%I
         for each row execute function public.audit_row_change()',
      t
    );
  end loop;
end;
$$;

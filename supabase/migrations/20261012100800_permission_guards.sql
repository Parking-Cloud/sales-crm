-- Rules that row level security cannot express on its own.

-- Only administrators set or change prices (net price and VAT rate) in
-- parking_products. Sessions without an auth user (migrations, scripts,
-- service role) are not API users and are not restricted here.
create function public.guard_product_prices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT'
     and (new.prezzo_netto is not null or new.iva_pct is not null) then
    raise exception 'only administrators can set product prices'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE'
     and (new.prezzo_netto is distinct from old.prezzo_netto
          or new.iva_pct is distinct from old.iva_pct) then
    raise exception 'only administrators can change product prices'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_product_prices() from public;

create trigger guard_product_prices
  before insert or update on public.parking_products
  for each row execute function public.guard_product_prices();

-- audit_logs and import_batches are append-only for everyone, including the
-- service role and direct database sessions.
create function public.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only: % is not allowed', tg_table_name, lower(tg_op)
    using errcode = '42501';
end;
$$;

revoke all on function public.forbid_change() from public;

create trigger forbid_update_delete
  before update or delete on public.audit_logs
  for each row execute function public.forbid_change();
create trigger forbid_truncate
  before truncate on public.audit_logs
  for each statement execute function public.forbid_change();

create trigger forbid_update_delete
  before update or delete on public.import_batches
  for each row execute function public.forbid_change();
create trigger forbid_truncate
  before truncate on public.import_batches
  for each statement execute function public.forbid_change();

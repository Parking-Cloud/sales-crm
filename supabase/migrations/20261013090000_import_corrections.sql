-- Block 1a-4, corrections to earlier blocks.
--
-- 1. Audit trigger on party_locations: the party history shows location changes.
-- 2. import_batches: annullato_il can be set once, only by an administrator,
--    with no other change; everything else stays append-only.
-- 3. import_batch_id on the rows an import creates, so "annulla import"
--    deletes only those rows.

create trigger audit_row_change
  after insert or update or delete on public.party_locations
  for each row execute function public.audit_row_change();

-- import_batches: replace the blanket update ban with the single exception.
drop trigger forbid_update_delete on public.import_batches;

create function public.guard_import_batch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'import_batches is append-only: delete is not allowed' using errcode = '42501';
  end if;
  if old.annullato_il is not null
     or new.annullato_il is null
     or (to_jsonb(new) - 'annullato_il') <> (to_jsonb(old) - 'annullato_il') then
    raise exception 'import_batches: only annullato_il can be set, once' using errcode = '42501';
  end if;
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'only administrators can cancel an import' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_import_batch() from public;

create trigger guard_import_batch
  before update or delete on public.import_batches
  for each row execute function public.guard_import_batch();

grant update (annullato_il) on public.import_batches to authenticated;

create policy update_admin on public.import_batches
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Rows created by an import.
alter table public.parties add column import_batch_id uuid references public.import_batches (id);
alter table public.contacts add column import_batch_id uuid references public.import_batches (id);
alter table public.party_locations add column import_batch_id uuid references public.import_batches (id);
alter table public.opportunities add column import_batch_id uuid references public.import_batches (id);
alter table public.activities add column import_batch_id uuid references public.import_batches (id);
alter table public.offers add column import_batch_id uuid references public.import_batches (id);

create index parties_import_batch_id on public.parties (import_batch_id) where import_batch_id is not null;
create index contacts_import_batch_id on public.contacts (import_batch_id) where import_batch_id is not null;
create index party_locations_import_batch_id on public.party_locations (import_batch_id) where import_batch_id is not null;
create index opportunities_import_batch_id on public.opportunities (import_batch_id) where import_batch_id is not null;
create index activities_import_batch_id on public.activities (import_batch_id) where import_batch_id is not null;
create index offers_import_batch_id on public.offers (import_batch_id) where import_batch_id is not null;

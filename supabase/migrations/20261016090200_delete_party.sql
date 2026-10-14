-- Block 1a-6, A4: delete a party, administrators only (not the GDPR erasure
-- of block 1a-7). Everything attached goes in the same transaction: its
-- opportunities (with activities, reminders, offers), locations, contacts,
-- activities, permissions, external references, provenance, and the parties
-- merged into it. The audit triggers record each deletion with the author.

create function public.party_delete_summary(p_party uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'sedi', (select count(*) from public.party_locations where party_id = p_party),
    'contatti', (select count(*) from public.contacts where party_id = p_party),
    'opportunita', (select count(*) from public.opportunities where party_id = p_party),
    'attivita', (select count(*) from public.activities a
                 where a.party_id = p_party
                    or a.opportunity_id in (select id from public.opportunities where party_id = p_party)),
    'offerte', (select count(*) from public.offers f
                where f.opportunity_id in (select id from public.opportunities where party_id = p_party)),
    'uniti', (select count(*) from public.parties where merged_into_id = p_party)
  )
$$;

grant execute on function public.party_delete_summary(uuid) to authenticated;

create function public.delete_party(p_party uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_summary jsonb;
  v_ids uuid[];
begin
  if not public.is_admin() then
    raise exception 'only administrators can delete a party' using errcode = '42501';
  end if;
  if not exists (select 1 from public.parties where id = p_party) then
    raise exception 'party not found' using errcode = 'P0002';
  end if;
  v_summary := public.party_delete_summary(p_party);
  -- The party and the parties merged into it (their data already moved here).
  select array_agg(id) into v_ids from public.parties where id = p_party or merged_into_id = p_party;

  delete from public.opportunities where party_id = any (v_ids);
  delete from public.field_provenance
  where (entita = 'parties' and entita_id = any (v_ids))
     or (entita = 'contacts' and entita_id in (select id from public.contacts where party_id = any (v_ids)));
  delete from public.external_references where entita = 'parties' and entita_id = any (v_ids);
  delete from public.parties where merged_into_id = p_party;
  delete from public.parties where id = p_party;
  return v_summary;
end;
$$;

grant execute on function public.delete_party(uuid) to authenticated;

-- Block 1a-4: "Annulla import" (CRM-15), administrators only.
--
-- Deletes only the rows created by the batch. It is refused, with the list
-- of what is in the way, when after the import someone:
--   - changed a row created by the batch (updated_at moved past created_at);
--   - added contacts, locations, opportunities, activities or offers to the
--     batch's parties or opportunities;
--   - merged a batch party, or merged another party into one.
-- On success annullato_il is set (the only change allowed on a batch).
-- Returns { ok, blockers: [{ tabella, id, descrizione }], eliminati: {...} }.

create function public.undo_import_batch(p_batch uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  batch public.import_batches;
  blockers jsonb;
  counts jsonb;
  n_offers integer;
  n_activities integer;
  n_opps integer;
  n_contacts integer;
  n_locations integer;
  n_parties integer;
begin
  if not public.is_admin() then
    raise exception 'only administrators can cancel an import' using errcode = '42501';
  end if;
  select * into batch from public.import_batches where id = p_batch for update;
  if batch.id is null then
    raise exception 'import not found' using errcode = 'P0002';
  end if;
  if batch.annullato_il is not null then
    raise exception 'import already cancelled' using errcode = '22023';
  end if;

  with
  parties_b as (select * from public.parties where import_batch_id = p_batch),
  opps_b as (select * from public.opportunities where import_batch_id = p_batch),
  found as (
    select 'parties' as tabella, p.id, coalesce(p.denominazione, concat_ws(' ', p.nome, p.cognome)) || ': modificato dopo l''import' as descrizione
    from parties_b p where p.updated_at > p.created_at
    union all
    select 'parties', p.id, coalesce(p.denominazione, concat_ws(' ', p.nome, p.cognome)) || ': unito a un altro soggetto'
    from parties_b p where p.merged_into_id is not null
    union all
    select 'parties', m.id, coalesce(m.denominazione, concat_ws(' ', m.nome, m.cognome)) || ': unito in un soggetto dell''import'
    from public.parties m join parties_b p on m.merged_into_id = p.id
    union all
    select 'contacts', c.id, concat_ws(' ', c.nome, c.cognome) || ': contatto modificato dopo l''import'
    from public.contacts c where c.import_batch_id = p_batch and c.updated_at > c.created_at
    union all
    select 'contacts', c.id, concat_ws(' ', c.nome, c.cognome) || ': contatto aggiunto dopo l''import'
    from public.contacts c join parties_b p on c.party_id = p.id
    where c.import_batch_id is distinct from p_batch
    union all
    select 'party_locations', l.id, coalesce(l.indirizzo, l.citta, 'sede') || ': sede aggiunta o modificata dopo l''import'
    from public.party_locations l join parties_b p on l.party_id = p.id
    where l.import_batch_id is distinct from p_batch or l.updated_at > l.created_at
    union all
    select 'opportunities', o.id, 'Opportunità modificata dopo l''import'
    from opps_b o where o.updated_at > o.created_at
    union all
    select 'opportunities', o.id, 'Opportunità aggiunta dopo l''import'
    from public.opportunities o join parties_b p on o.party_id = p.id
    where o.import_batch_id is distinct from p_batch
    union all
    select 'activities', a.id, 'Attività del ' || to_char(a.avvenuta_il at time zone 'Europe/Rome', 'DD/MM/YYYY') || ' aggiunta dopo l''import'
    from public.activities a
    where a.import_batch_id is distinct from p_batch
      and (a.opportunity_id in (select id from opps_b) or a.party_id in (select id from parties_b))
    union all
    select 'activities', a.id, 'Attività modificata dopo l''import'
    from public.activities a where a.import_batch_id = p_batch and a.updated_at > a.created_at
    union all
    select 'offers', f.id, 'Offerta versione ' || f.versione || ' aggiunta o modificata dopo l''import'
    from public.offers f
    where (f.import_batch_id is distinct from p_batch and f.opportunity_id in (select id from opps_b))
       or (f.import_batch_id = p_batch and f.updated_at > f.created_at)
  )
  select coalesce(jsonb_agg(jsonb_build_object('tabella', tabella, 'id', id, 'descrizione', descrizione)), '[]'::jsonb)
  into blockers
  from (select * from found limit 50) f;

  if jsonb_array_length(blockers) > 0 then
    return jsonb_build_object('ok', false, 'blockers', blockers);
  end if;

  delete from public.offers where import_batch_id = p_batch;
  get diagnostics n_offers = row_count;
  delete from public.activities where import_batch_id = p_batch;
  get diagnostics n_activities = row_count;
  delete from public.field_provenance
  where (entita = 'parties' and entita_id in (select id from public.parties where import_batch_id = p_batch))
     or (entita = 'contacts' and entita_id in (select id from public.contacts where import_batch_id = p_batch));
  delete from public.external_references
  where entita = 'parties' and entita_id in (select id from public.parties where import_batch_id = p_batch);
  delete from public.opportunities where import_batch_id = p_batch;
  get diagnostics n_opps = row_count;
  delete from public.contacts where import_batch_id = p_batch;
  get diagnostics n_contacts = row_count;
  delete from public.party_locations where import_batch_id = p_batch;
  get diagnostics n_locations = row_count;
  delete from public.parties where import_batch_id = p_batch;
  get diagnostics n_parties = row_count;

  update public.import_batches set annullato_il = now() where id = p_batch;

  counts := jsonb_build_object(
    'soggetti', n_parties, 'contatti', n_contacts, 'sedi', n_locations,
    'opportunita', n_opps, 'attivita', n_activities, 'offerte', n_offers
  );
  return jsonb_build_object('ok', true, 'blockers', '[]'::jsonb, 'eliminati', counts);
end;
$$;

grant execute on function public.undo_import_batch(uuid) to authenticated;

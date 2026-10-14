-- "Annulla import": blockers that can be read and acted on, also when they
-- are many (e.g. a second import that added opportunities and activities to
-- the parties of the first one).
--
-- Same rules and same deletions as 20261013090400_undo_import.sql. Changes:
-- - every blocker carries the party it belongs to (party_id, soggetto) and,
--   when another import created it, that import (batch_id);
-- - totale: all blockers, not only the ones listed (at most 500);
-- - cause: blockers grouped by the import that caused them (batch_id, file,
--   created_at, n) or by hand (batch_id null);
-- - descriptions never null.
-- Returns { ok, totale, cause, blockers: [{ tabella, id, descrizione,
-- party_id, soggetto, batch_id }], eliminati: {...} }.

create or replace function public.undo_import_batch(p_batch uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  batch public.import_batches;
  v_found jsonb;
  blockers jsonb;
  causes jsonb;
  total integer;
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
  hits as (
    select 'parties' as tabella, p.id, 'Soggetto modificato dopo l''import' as descrizione, p.id as party_id, null::uuid as batch_id
    from parties_b p where p.updated_at > p.created_at
    union all
    select 'parties', p.id, 'Soggetto unito a un altro soggetto', p.id, null
    from parties_b p where p.merged_into_id is not null
    union all
    select 'parties', m.id, 'Un altro soggetto è stato unito a questo', p.id, m.import_batch_id
    from public.parties m join parties_b p on m.merged_into_id = p.id
    union all
    select 'contacts', c.id, 'Contatto modificato dopo l''import', c.party_id, null
    from public.contacts c where c.import_batch_id = p_batch and c.updated_at > c.created_at
    union all
    select 'contacts', c.id, 'Contatto aggiunto dopo l''import', c.party_id, c.import_batch_id
    from public.contacts c join parties_b p on c.party_id = p.id
    where c.import_batch_id is distinct from p_batch
    union all
    select 'party_locations', l.id, 'Sede aggiunta o modificata dopo l''import', l.party_id,
      case when l.import_batch_id is distinct from p_batch then l.import_batch_id end
    from public.party_locations l join parties_b p on l.party_id = p.id
    where l.import_batch_id is distinct from p_batch or l.updated_at > l.created_at
    union all
    select 'opportunities', o.id, 'Opportunità modificata dopo l''import', o.party_id, null
    from opps_b o where o.updated_at > o.created_at
    union all
    select 'opportunities', o.id, 'Opportunità aggiunta dopo l''import', o.party_id, o.import_batch_id
    from public.opportunities o join parties_b p on o.party_id = p.id
    where o.import_batch_id is distinct from p_batch
    union all
    select 'activities', a.id,
      'Attività del ' || coalesce(to_char(a.avvenuta_il at time zone 'Europe/Rome', 'DD/MM/YYYY'), '–') || ' aggiunta dopo l''import',
      coalesce(a.party_id, (select o.party_id from public.opportunities o where o.id = a.opportunity_id)), a.import_batch_id
    from public.activities a
    where a.import_batch_id is distinct from p_batch
      and (a.opportunity_id in (select id from opps_b) or a.party_id in (select id from parties_b))
    union all
    select 'activities', a.id, 'Attività modificata dopo l''import',
      coalesce(a.party_id, (select o.party_id from public.opportunities o where o.id = a.opportunity_id)), null
    from public.activities a where a.import_batch_id = p_batch and a.updated_at > a.created_at
    union all
    select 'offers', f.id, 'Offerta versione ' || f.versione || ' aggiunta o modificata dopo l''import',
      (select o.party_id from public.opportunities o where o.id = f.opportunity_id),
      case when f.import_batch_id is distinct from p_batch then f.import_batch_id end
    from public.offers f
    where (f.import_batch_id is distinct from p_batch and f.opportunity_id in (select id from opps_b))
       or (f.import_batch_id = p_batch and f.updated_at > f.created_at)
  )
  select coalesce(jsonb_agg(to_jsonb(hits)), '[]'::jsonb) into v_found from hits;

  total := jsonb_array_length(v_found);

  if total > 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
             'batch_id', c.batch_id, 'file', b.file, 'created_at', b.created_at, 'n', c.n)
             order by c.batch_id is null, b.created_at), '[]'::jsonb)
    into causes
    from (select (x ->> 'batch_id')::uuid as batch_id, count(*) as n
          from jsonb_array_elements(v_found) x group by 1) c
    left join public.import_batches b on b.id = c.batch_id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'tabella', u.tabella, 'id', u.id, 'descrizione', u.descrizione, 'party_id', u.party_id,
             'soggetto', coalesce(p.denominazione, nullif(btrim(concat_ws(' ', p.nome, p.cognome)), ''), 'Soggetto senza nome'),
             'batch_id', u.batch_id)
             order by p.denominazione, p.cognome, u.tabella), '[]'::jsonb)
    into blockers
    from (
      select x ->> 'tabella' as tabella, (x ->> 'id')::uuid as id, coalesce(x ->> 'descrizione', 'Modifica dopo l''import') as descrizione,
             (x ->> 'party_id')::uuid as party_id, (x ->> 'batch_id')::uuid as batch_id
      from jsonb_array_elements(v_found) x
      limit 500
    ) u
    left join public.parties p on p.id = u.party_id;

    return jsonb_build_object('ok', false, 'totale', total, 'cause', causes, 'blockers', blockers);
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
  return jsonb_build_object('ok', true, 'totale', 0, 'cause', '[]'::jsonb, 'blockers', '[]'::jsonb, 'eliminati', counts);
end;
$$;

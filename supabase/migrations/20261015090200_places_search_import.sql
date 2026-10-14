-- Block 1a-5: map search results (CRM-06) and selective import (CRM-07).

-- Status of search results, all in one call:
--   presente   same place_id already imported, or a duplicate warning or
--              block (same name in the same CAP or city, ...);
--   esclusione the party found is marked "non contattare", or a value of
--              the result is in the suppression list;
--   nuovo      nothing found.
-- p_places: [{ "place_id", "nome", "cap", "citta" }]. Search results carry
-- no phone or site (those are Enterprise fields, read only at import), so
-- the suppression list is checked again, fully, by import_places.
create function public.check_places(p_places jsonb)
returns table (place_id text, stato text, party_id uuid, nome text, motivo text)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select x ->> 'place_id' as place_id, x ->> 'nome' as nome, x ->> 'cap' as cap, x ->> 'citta' as citta
    from jsonb_array_elements(coalesce(p_places, '[]'::jsonb)) x
    where nullif(x ->> 'place_id', '') is not null
  ),
  hits as (
    select i.place_id, d.livello, d.motivo, d.party_id, d.nome
    from input i
    cross join lateral public.check_party_duplicates(
      p_denominazione => i.nome, p_place_id => i.place_id, p_cap => i.cap, p_citta => i.citta
    ) d
  ),
  ranked as (
    select distinct on (h.place_id)
      h.place_id,
      case
        when h.motivo like 'Nella lista di esclusione%' or coalesce(p.non_contattare, false) then 'esclusione'
        else 'presente'
      end as stato,
      h.party_id,
      coalesce(h.nome, coalesce(p.denominazione, nullif(btrim(concat_ws(' ', p.nome, p.cognome)), ''))) as nome,
      h.motivo
    from hits h
    left join public.parties p on p.id = h.party_id
    order by h.place_id,
      (h.motivo like 'Nella lista di esclusione%' or coalesce(p.non_contattare, false)) desc,
      (h.motivo like 'Stesso luogo Google%') desc,
      h.livello desc
  )
  select i.place_id, coalesce(r.stato, 'nuovo'), r.party_id, r.nome, r.motivo
  from input i
  left join ranked r on r.place_id = i.place_id
$$;

grant execute on function public.check_places(jsonb) to authenticated;

-- Imports the chosen results on a car park, in one transaction.
-- p_rows: [{ place_id, nome, categoria, telefono, sito, indirizzo, cap,
--   citta, lat, lng, scelta ('crea' | 'unisci' | null), unisci_a }]
-- (phone, site and address from Place Details, read just before).
-- For each row the duplicate check runs again, with phone and site:
--   block                -> skipped (same place, VAT, suppression list);
--   warning, no choice   -> skipped, "da decidere";
--   warning + 'unisci'   -> only an opportunity on the car park for the
--                           existing party (if it has no open one there);
--   warning + 'crea', or no duplicate -> new party (company), main location
--   with Google coordinates and date, place_id in external_references,
--   provenance "Google Places" / "da verificare", opportunity "individuata"
--   on the car park, assigned to the caller.
-- Returns { creati, aggiunti, saltati, righe: [{ place_id, esito, motivo, party_id, nome }] }.
create function public.import_places(p_parking uuid, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r jsonb;
  v_source uuid;
  v_party uuid;
  v_block record;
  v_warn record;
  v_choice text;
  v_target uuid;
  v_results jsonb := '[]'::jsonb;
  v_created integer := 0;
  v_added integer := 0;
  v_skipped integer := 0;
begin
  if not public.is_active_user() then
    raise exception 'not an active user' using errcode = '42501';
  end if;
  if not exists (select 1 from public.parking_facilities where id = p_parking and archived_at is null) then
    raise exception 'car park not found' using errcode = 'P0002';
  end if;
  if jsonb_array_length(coalesce(p_rows, '[]'::jsonb)) > 50 then
    raise exception 'at most 50 results per import' using errcode = '22023';
  end if;

  select id into v_source from public.data_sources where nome = 'Google Places';

  for r in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if nullif(r ->> 'place_id', '') is null or nullif(btrim(r ->> 'nome'), '') is null then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object('place_id', r ->> 'place_id', 'esito', 'saltato', 'motivo', 'Dati del risultato mancanti', 'party_id', null, 'nome', r ->> 'nome');
      continue;
    end if;

    select d.motivo, d.party_id, d.nome into v_block
    from public.check_party_duplicates(
      p_denominazione => r ->> 'nome', p_place_id => r ->> 'place_id', p_telefono => r ->> 'telefono',
      p_sito => r ->> 'sito', p_cap => r ->> 'cap', p_citta => r ->> 'citta'
    ) d
    where d.livello = 'blocco'
    limit 1;

    if found then
      v_skipped := v_skipped + 1;
      v_results := v_results || jsonb_build_object('place_id', r ->> 'place_id', 'esito', 'saltato', 'motivo', v_block.motivo, 'party_id', v_block.party_id, 'nome', coalesce(v_block.nome, r ->> 'nome'));
      continue;
    end if;

    v_choice := r ->> 'scelta';
    v_target := nullif(r ->> 'unisci_a', '')::uuid;
    select d.motivo, d.party_id, d.nome into v_warn
    from public.check_party_duplicates(
      p_denominazione => r ->> 'nome', p_place_id => r ->> 'place_id', p_telefono => r ->> 'telefono',
      p_sito => r ->> 'sito', p_cap => r ->> 'cap', p_citta => r ->> 'citta'
    ) d
    where d.livello = 'avviso' and (v_target is null or d.party_id = v_target)
    limit 1;

    if found and v_choice is distinct from 'crea' then
      if v_choice = 'unisci' and v_target is not null and v_warn.party_id = v_target then
        -- Add to the existing party: only the opportunity on the car park.
        if not exists (select 1 from public.opportunities o
                       where o.party_id = v_target and o.parking_id = p_parking and o.esito = 'aperta') then
          insert into public.opportunities (party_id, parking_id, responsabile_id, fase)
          values (v_target, p_parking, auth.uid(), 'individuata');
        end if;
        v_added := v_added + 1;
        v_results := v_results || jsonb_build_object('place_id', r ->> 'place_id', 'esito', 'aggiunto', 'motivo', v_warn.motivo, 'party_id', v_target, 'nome', coalesce(v_warn.nome, r ->> 'nome'));
      else
        v_skipped := v_skipped + 1;
        v_results := v_results || jsonb_build_object('place_id', r ->> 'place_id', 'esito', 'da_decidere', 'motivo', v_warn.motivo, 'party_id', v_warn.party_id, 'nome', r ->> 'nome');
      end if;
      continue;
    end if;

    insert into public.parties (tipo, denominazione, categoria, telefono, sito)
    values ('azienda', btrim(r ->> 'nome'), nullif(r ->> 'categoria', ''), nullif(r ->> 'telefono', ''), nullif(r ->> 'sito', ''))
    returning id into v_party;

    insert into public.party_locations (party_id, indirizzo, cap, citta, principale, lat, lng, coordinate_fonte, coordinate_aggiornate_il)
    values (
      v_party, nullif(r ->> 'indirizzo', ''), nullif(r ->> 'cap', ''), nullif(r ->> 'citta', ''), true,
      (r ->> 'lat')::double precision, (r ->> 'lng')::double precision,
      case when r ->> 'lat' is not null and r ->> 'lng' is not null then 'google' end,
      case when r ->> 'lat' is not null and r ->> 'lng' is not null then now() end
    );

    insert into public.external_references (entita, entita_id, sistema, id_esterno, letto_il)
    values ('parties', v_party, 'google_places', r ->> 'place_id', now());

    insert into public.field_provenance (entita, entita_id, campo, fonte_id, stato, acquisito_il)
    select 'parties', v_party, f.campo, v_source, 'da_verificare', now()
    from (values ('denominazione', r ->> 'nome'), ('telefono', r ->> 'telefono'), ('sito', r ->> 'sito')) f (campo, valore)
    where nullif(f.valore, '') is not null
    on conflict (entita, entita_id, campo) do nothing;

    insert into public.opportunities (party_id, parking_id, responsabile_id, fase)
    values (v_party, p_parking, auth.uid(), 'individuata');

    v_created := v_created + 1;
    v_results := v_results || jsonb_build_object('place_id', r ->> 'place_id', 'esito', 'creato', 'motivo', null, 'party_id', v_party, 'nome', r ->> 'nome');
  end loop;

  return jsonb_build_object('creati', v_created, 'aggiunti', v_added, 'saltati', v_skipped, 'righe', v_results);
end;
$$;

grant execute on function public.import_places(uuid, jsonb) to authenticated;

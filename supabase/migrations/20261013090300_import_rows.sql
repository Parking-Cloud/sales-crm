-- Block 1a-4: import of a previewed plan in one transaction (CRM-15).
--
-- Administrators only. Creates the import batch first, then, row by row:
-- party (or the existing one chosen in the preview, or the one created by a
-- linked row of the same file), contact, opportunity on the chosen car park,
-- activities and offer. Every created row carries import_batch_id. Field
-- provenance is "Import Excel" / "da verificare". No contact permissions
-- are created: operators restore them by hand.
-- Any error rolls the whole import back.
--
-- p_rows: the plan rows as built by src/lib/import/transform.ts (anagrafica
-- rows first). p_report: [{foglio, riga, soggetto, esito, motivo}] for the
-- downloadable error report, stored with the batch counts.

create function public.import_rows(p_file text, p_rows jsonb, p_report jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch uuid;
  source_id uuid;
  r jsonb;
  a jsonb;
  v_party uuid;
  v_contact uuid;
  v_opp uuid;
  v_offer uuid;
  v_parking uuid;
  opp_key text;
  party_map jsonb := '{}'::jsonb;
  opp_map jsonb := '{}'::jsonb;
  merged_parties uuid[] := '{}';
  created_parties integer := 0;
  created_contacts integer := 0;
  created_opps integer := 0;
  created_activities integer := 0;
  created_offers integer := 0;
  included jsonb;
begin
  if not public.is_admin() then
    raise exception 'only administrators can import' using errcode = '42501';
  end if;
  if nullif(btrim(p_file), '') is null then
    raise exception 'file name required' using errcode = '22023';
  end if;

  select id into source_id from public.data_sources where nome = 'Import Excel';

  select coalesce(jsonb_agg(x), '[]'::jsonb) into included
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
  where x ->> 'decision' <> 'escludi' and x ->> 'status' <> 'scartata';

  -- Counts are stored when the batch is created (the batch is append-only).
  insert into public.import_batches (file, conteggi)
  values (
    btrim(p_file),
    jsonb_build_object(
      'righe', jsonb_array_length(coalesce(p_rows, '[]'::jsonb)),
      'importate', jsonb_array_length(included),
      'nuovi_soggetti', (select count(*) from jsonb_array_elements(included) x
                         where x ->> 'decision' = 'crea' and (x ->> 'linkTo') is null),
      'aggiunte_a_esistenti', (select count(*) from jsonb_array_elements(included) x
                               where x ->> 'decision' = 'unisci' or (x ->> 'linkTo') is not null),
      'scartate', (select count(*) from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x where x ->> 'status' = 'scartata'),
      'escluse', (select count(*) from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
                  where x ->> 'decision' = 'escludi' and x ->> 'status' <> 'scartata'),
      'con_avvisi', (select count(*) from jsonb_array_elements(included) x where jsonb_array_length(x -> 'warnings') > 0),
      'attivita', (select coalesce(sum(jsonb_array_length(x -> 'activities')), 0) from jsonb_array_elements(included) x),
      'offerte', (select count(*) from jsonb_array_elements(included) x where jsonb_typeof(x -> 'offer') = 'object'),
      'report', coalesce(p_report, '[]'::jsonb)
    )
  )
  returning id into v_batch;

  for r in select value from jsonb_array_elements(included) loop
    v_party := null;
    v_parking := nullif(r ->> 'parkingId', '')::uuid;

    -- Party: linked row of the same file, existing party, or a new one.
    if (r ->> 'linkTo') is not null and party_map ? (r ->> 'linkTo') then
      v_party := (party_map ->> (r ->> 'linkTo'))::uuid;
    elsif r ->> 'decision' = 'unisci' and nullif(r ->> 'mergeInto', '') is not null then
      select id into v_party from public.parties
      where id = (r ->> 'mergeInto')::uuid and merged_into_id is null;
      if v_party is null then
        raise exception 'row %: party to merge into not found', r ->> 'ref' using errcode = 'P0002';
      end if;
      merged_parties := array_append(merged_parties, v_party);
    end if;

    if v_party is null then
      insert into public.parties (tipo, denominazione, nome, cognome, categoria, sito, telefono, email, form_web_url, import_batch_id)
      values (
        (r -> 'party' ->> 'tipo')::public.party_type,
        r -> 'party' ->> 'denominazione',
        r -> 'party' ->> 'nome',
        r -> 'party' ->> 'cognome',
        r -> 'party' ->> 'categoria',
        r -> 'party' ->> 'sito',
        r -> 'party' ->> 'telefono',
        r -> 'party' ->> 'email',
        r -> 'party' ->> 'form_web_url',
        v_batch
      )
      returning id into v_party;
      created_parties := created_parties + 1;

      insert into public.field_provenance (entita, entita_id, campo, fonte_id, stato, acquisito_il)
      select 'parties', v_party, f.campo, source_id, 'da_verificare', now()
      from (values ('telefono'), ('email'), ('sito')) f (campo)
      where nullif(r -> 'party' ->> f.campo, '') is not null
      on conflict (entita, entita_id, campo) do nothing;

      if nullif(r ->> 'externalId', '') is not null then
        insert into public.external_references (entita, entita_id, sistema, id_esterno, letto_il)
        values ('parties', v_party, 'excel', r ->> 'externalId', now())
        on conflict (sistema, id_esterno) do nothing;
      end if;
    end if;
    party_map := party_map || jsonb_build_object(r ->> 'ref', v_party);

    -- Contact person.
    v_contact := null;
    if jsonb_typeof(r -> 'contact') = 'object'
       and coalesce(r -> 'contact' ->> 'nome', r -> 'contact' ->> 'cognome', r -> 'contact' ->> 'ruolo',
                    r -> 'contact' ->> 'email', r -> 'contact' ->> 'telefono') is not null then
      insert into public.contacts (party_id, nome, cognome, ruolo, email, telefono, import_batch_id)
      values (
        v_party,
        r -> 'contact' ->> 'nome',
        r -> 'contact' ->> 'cognome',
        r -> 'contact' ->> 'ruolo',
        r -> 'contact' ->> 'email',
        r -> 'contact' ->> 'telefono',
        v_batch
      )
      returning id into v_contact;
      created_contacts := created_contacts + 1;
      insert into public.field_provenance (entita, entita_id, campo, fonte_id, stato, acquisito_il)
      values ('contacts', v_contact, 'referente', source_id, 'da_verificare', now())
      on conflict (entita, entita_id, campo) do nothing;
    end if;

    -- Opportunity on the sheet's car park.
    v_opp := null;
    if v_parking is not null then
      opp_key := v_party::text || ':' || v_parking::text;
      if opp_map ? opp_key then
        v_opp := (opp_map ->> opp_key)::uuid;
        -- A prospect row updates the opportunity created by its anagrafica row.
        if r ->> 'kind' = 'prospect' then
          update public.opportunities
          set fase = (r -> 'opportunity' ->> 'fase')::public.opportunity_stage,
              esito = (r -> 'opportunity' ->> 'esito')::public.opportunity_outcome,
              motivo_perdita = case when r -> 'opportunity' ->> 'esito' = 'persa'
                                    then coalesce(r -> 'opportunity' ->> 'motivo_perdita', 'altro')::public.loss_reason end,
              posti_richiesti = coalesce((r -> 'opportunity' ->> 'posti_richiesti')::integer, posti_richiesti)
          where id = v_opp;
        end if;
      else
        -- An existing open opportunity on the same pair is reused as it is.
        select id into v_opp from public.opportunities
        where opportunities.party_id = v_party and opportunities.parking_id = v_parking and opportunities.esito = 'aperta'
        limit 1;
        if v_opp is null then
          insert into public.opportunities
            (party_id, parking_id, responsabile_id, fase, esito, motivo_perdita, posti_richiesti, import_batch_id)
          values (
            v_party,
            v_parking,
            auth.uid(),
            (r -> 'opportunity' ->> 'fase')::public.opportunity_stage,
            (r -> 'opportunity' ->> 'esito')::public.opportunity_outcome,
            case when r -> 'opportunity' ->> 'esito' = 'persa'
                 then coalesce(r -> 'opportunity' ->> 'motivo_perdita', 'altro')::public.loss_reason end,
            (r -> 'opportunity' ->> 'posti_richiesti')::integer,
            v_batch
          )
          returning id into v_opp;
          created_opps := created_opps + 1;
        end if;
        opp_map := opp_map || jsonb_build_object(opp_key, v_opp);
      end if;
    end if;

    -- Activities (calls, emails, diary notes). Dated at noon, Italian time.
    for a in select value from jsonb_array_elements(coalesce(r -> 'activities', '[]'::jsonb)) loop
      insert into public.activities (opportunity_id, party_id, contact_id, tipo, testo, avvenuta_il, import_batch_id)
      values (
        v_opp,
        v_party,
        v_contact,
        (a ->> 'tipo')::public.activity_type,
        a ->> 'testo',
        coalesce(((a ->> 'data') || ' 12:00')::timestamp at time zone 'Europe/Rome', now()),
        v_batch
      );
      created_activities := created_activities + 1;
    end loop;

    -- Offer with one item (prospect rows).
    if jsonb_typeof(r -> 'offer') = 'object' and v_opp is not null then
      insert into public.offers
        (opportunity_id, versione, stato, inviata_il, accettata_il, motivo_rifiuto, condizioni, import_batch_id)
      values (
        v_opp,
        coalesce((select max(versione) from public.offers o where o.opportunity_id = v_opp), 0) + 1,
        (r -> 'offer' ->> 'stato')::public.offer_status,
        ((r -> 'offer' ->> 'inviata_il') || ' 12:00')::timestamp at time zone 'Europe/Rome',
        ((r -> 'offer' ->> 'accettata_il') || ' 12:00')::timestamp at time zone 'Europe/Rome',
        r -> 'offer' ->> 'motivo_rifiuto',
        r -> 'offer' -> 'condizioni',
        v_batch
      )
      returning id into v_offer;
      insert into public.offer_items (offer_id, descrizione, posti, prezzo_netto)
      values (
        v_offer,
        coalesce('Offerta importata: ' || (r -> 'offer' -> 'condizioni' ->> 'testo_originale'), 'Offerta importata da Excel'),
        (r -> 'offer' ->> 'posti')::integer,
        coalesce((r -> 'offer' ->> 'importo')::numeric, 0)
      );
      created_offers := created_offers + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'batch_id', v_batch,
    'soggetti_creati', created_parties,
    'soggetti_aggiornati', (select count(distinct x) from unnest(merged_parties) x),
    'contatti', created_contacts,
    'opportunita', created_opps,
    'attivita', created_activities,
    'offerte', created_offers
  );
end;
$$;

grant execute on function public.import_rows(text, jsonb, jsonb) to authenticated;

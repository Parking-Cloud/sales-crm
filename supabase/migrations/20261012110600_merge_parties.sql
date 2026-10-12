-- Block 1a-3: merge two parties (CRM-11), administrators only.
--
-- One transaction: the kept party takes the chosen field values; locations,
-- contacts, provenance, external references, permissions, activities and
-- opportunities move to it; the other party keeps its row with
-- merged_into_id set (hidden from lists, its page redirects). Every change
-- to parties and contacts is recorded by the audit triggers.
--
-- p_values: the final field values for the kept party, as a JSON object with
-- any of the keys below (missing keys keep the current value).

create function public.merge_parties(p_keep uuid, p_drop uuid, p_values jsonb default '{}'::jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allowed constant text[] := array[
    'tipo', 'denominazione', 'nome', 'cognome', 'categoria', 'piva', 'codice_fiscale',
    'sito', 'telefono', 'email', 'dipendenti_stimati', 'parcheggio_privato',
    'non_contattare', 'form_web_url'
  ];
  keep_row public.parties;
  drop_row public.parties;
  merged public.parties;
  field text;
  values_in jsonb;
begin
  if not public.is_admin() then
    raise exception 'only administrators can merge parties' using errcode = '42501';
  end if;
  if p_keep is null or p_drop is null or p_keep = p_drop then
    raise exception 'choose two different parties' using errcode = '22023';
  end if;

  select * into keep_row from public.parties where id = p_keep for update;
  select * into drop_row from public.parties where id = p_drop for update;
  if keep_row.id is null or drop_row.id is null then
    raise exception 'party not found' using errcode = 'P0002';
  end if;
  if keep_row.merged_into_id is not null or drop_row.merged_into_id is not null then
    raise exception 'party already merged' using errcode = '22023';
  end if;

  -- Only known fields; the kept party's values fill the rest.
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) into values_in
  from jsonb_each(coalesce(p_values, '{}'::jsonb))
  where key = any (allowed);
  merged := jsonb_populate_record(keep_row, values_in);

  -- Open opportunities on the same car park would violate the one-open rule.
  if exists (
    select 1
    from public.opportunities a
    join public.opportunities b on b.parking_id = a.parking_id
    where a.party_id = p_keep and b.party_id = p_drop
      and a.esito = 'aperta' and b.esito = 'aperta'
  ) then
    raise exception 'both parties have an open opportunity on the same car park: close one first'
      using errcode = '23505';
  end if;

  -- The merged party: redirect, and free its unique VAT number.
  update public.parties
  set merged_into_id = p_keep, piva = null
  where id = p_drop;
  update public.parties set merged_into_id = p_keep where merged_into_id = p_drop;

  update public.parties
  set tipo = merged.tipo,
      denominazione = merged.denominazione,
      nome = merged.nome,
      cognome = merged.cognome,
      categoria = merged.categoria,
      piva = merged.piva,
      codice_fiscale = merged.codice_fiscale,
      sito = merged.sito,
      telefono = merged.telefono,
      email = merged.email,
      dipendenti_stimati = merged.dipendenti_stimati,
      parcheggio_privato = merged.parcheggio_privato,
      non_contattare = keep_row.non_contattare or drop_row.non_contattare or merged.non_contattare,
      form_web_url = merged.form_web_url
  where id = p_keep;

  -- Provenance follows the value: when a tracked field takes the merged
  -- party's value, its provenance replaces the kept one.
  foreach field in array public.party_tracked_fields() loop
    if (to_jsonb(merged) -> field) is distinct from (to_jsonb(keep_row) -> field)
       and (to_jsonb(merged) -> field) = (to_jsonb(drop_row) -> field) then
      delete from public.field_provenance
      where entita = 'parties' and entita_id = p_keep and campo = field;
    else
      delete from public.field_provenance f
      where f.entita = 'parties' and f.entita_id = p_drop and f.campo = field
        and exists (
          select 1 from public.field_provenance k
          where k.entita = 'parties' and k.entita_id = p_keep and k.campo = field
        );
    end if;
  end loop;
  delete from public.field_provenance d
  where d.entita = 'parties' and d.entita_id = p_drop
    and exists (
      select 1 from public.field_provenance k
      where k.entita = 'parties' and k.entita_id = p_keep and k.campo = d.campo
    );
  update public.field_provenance set entita_id = p_keep
  where entita = 'parties' and entita_id = p_drop;

  -- One main location: the kept party's, if it has one.
  if exists (select 1 from public.party_locations where party_id = p_keep and principale) then
    update public.party_locations set principale = false where party_id = p_drop and principale;
  end if;
  update public.party_locations set party_id = p_keep where party_id = p_drop;

  update public.contacts set party_id = p_keep where party_id = p_drop;
  update public.external_references set entita_id = p_keep
  where entita = 'parties' and entita_id = p_drop;
  update public.contact_permissions set party_id = p_keep where party_id = p_drop;
  update public.activities set party_id = p_keep where party_id = p_drop;
  update public.opportunities set party_id = p_keep where party_id = p_drop;
end;
$$;

grant execute on function public.merge_parties(uuid, uuid, jsonb) to authenticated;

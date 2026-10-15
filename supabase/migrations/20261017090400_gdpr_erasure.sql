-- Block 1a-7, part C3: erasure on GDPR request (CRM-31), administrators only.
--
-- gdpr_erase('parties' | 'contacts', id), in one transaction:
-- - the identifying values (emails, phones, domain, VAT number, Google
--   place, recipient addresses of past emails) go to the suppression list
--   as keyed hashes only, marked gdpr; matching entries in clear lose their
--   value. A new import or email with the same value is still blocked.
-- - personal data are deleted or blanked: contacts, locations, provenance,
--   external references, permissions, text of activities, reminders and
--   communications, notes; a party keeps only its id, type, category and a
--   placeholder name, flagged "do not contact"; its open opportunities are
--   closed as lost ("non_contattare"). Parties merged into it go the same way.
-- - the audit gets one entry for the erasure, with counts and no data;
--   earlier audit entries of the erased records lose their before/after
--   values (the only change ever allowed on audit_logs, and only here).

alter table public.parties add column gdpr_cancellato_il timestamptz;
alter table public.contacts add column gdpr_cancellato_il timestamptz;

-- Audit: no row-by-row entries while an erasure runs (they would copy the
-- data being erased); the erasure writes its own entry.
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_values jsonb;
  after_values jsonb;
begin
  if current_setting('crm.gdpr_erasure', true) = 'on' then
    return null;
  end if;

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

-- audit_logs stays append-only, except for blanking the before/after values
-- of erased records during an erasure (gdpr_erase runs as the owner; no API
-- role can update audit_logs at all).
create or replace function public.forbid_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'audit_logs' and tg_op = 'UPDATE'
     and current_setting('crm.gdpr_erasure', true) = 'on'
     and (new.id, new.utente_id, new.entita, new.entita_id, new.azione, new.quando)
         is not distinct from (old.id, old.utente_id, old.entita, old.entita_id, old.azione, old.quando)
     and new.prima is not distinct from (case when old.prima is null then null else '{"gdpr": "dati cancellati"}'::jsonb end)
     and new.dopo is not distinct from (case when old.dopo is null then null else '{"gdpr": "dati cancellati"}'::jsonb end) then
    return new;
  end if;
  raise exception '% is append-only: % is not allowed', tg_table_name, lower(tg_op)
    using errcode = '42501';
end;
$$;

create function public.gdpr_erase(p_entita text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parties uuid[];
  v_contacts uuid[];
  v_locations uuid[];
  v_opportunities uuid[];
  v_communications uuid[];
  v_ids uuid[];
  v_values integer;
  v_placeholder constant text := 'Soggetto cancellato (GDPR)';
  v_redacted constant jsonb := '{"gdpr": "dati cancellati"}';
  v_party uuid;
begin
  if not public.is_admin() then
    raise exception 'only administrators can erase personal data' using errcode = '42501';
  end if;

  if p_entita = 'parties' then
    perform 1 from public.parties where id = p_id and merged_into_id is null;
    if not found then
      raise exception 'party not found' using errcode = 'P0002';
    end if;
    -- The party and the parties merged into it (old copies of its data).
    with recursive tree(id) as (
      select p_id
      union
      select p.id from public.parties p join tree t on p.merged_into_id = t.id
    )
    select array_agg(id) into v_parties from tree;
    select coalesce(array_agg(id), '{}') into v_contacts from public.contacts where party_id = any (v_parties);
  elsif p_entita = 'contacts' then
    select party_id into v_party from public.contacts where id = p_id;
    if v_party is null then
      raise exception 'contact not found' using errcode = 'P0002';
    end if;
    v_parties := '{}';
    v_contacts := array[p_id];
  else
    raise exception 'unknown entity %', p_entita using errcode = '22023';
  end if;

  select coalesce(array_agg(id), '{}') into v_locations from public.party_locations where party_id = any (v_parties);
  select coalesce(array_agg(id), '{}') into v_opportunities from public.opportunities where party_id = any (v_parties);
  select coalesce(array_agg(id), '{}') into v_communications
  from public.communications
  where party_id = any (v_parties) or contact_id = any (v_contacts) or opportunity_id = any (v_opportunities);

  perform set_config('crm.gdpr_erasure', 'on', true);

  -- 1. Identifying values -> suppression list, hash only.
  drop table if exists pg_temp.gdpr_values;
  create temp table gdpr_values (tipo public.suppression_type, valore_hash text) on commit drop;
  insert into gdpr_values
  select distinct v.tipo, public.suppression_hash(v.valore)
  from (
    select d.tipo, d.valore from unnest(v_parties) pid cross join lateral public.do_not_contact_values('parties', pid) d
    union all
    select d.tipo, d.valore from unnest(v_contacts) cid cross join lateral public.do_not_contact_values('contacts', cid) d
    union all
    select 'email'::public.suppression_type, lower(btrim(c.a)) from public.communications c
    where c.id = any (v_communications) and c.a is not null
  ) v
  where nullif(btrim(v.valore), '') is not null;
  get diagnostics v_values = row_count;

  update public.suppression_list s
  set valore_normalizzato = null, gdpr = true, motivo = 'Cancellazione GDPR', canale = null
  where s.rimossa_il is null and s.valore_hash in (select valore_hash from gdpr_values);

  insert into public.suppression_list (tipo, valore_normalizzato, valore_hash, gdpr, motivo)
  select g.tipo, null, g.valore_hash, true, 'Cancellazione GDPR'
  from gdpr_values g
  where not exists (select 1 from public.suppression_list s where s.rimossa_il is null and s.valore_hash = g.valore_hash);

  -- Removed entries with the same values keep no value in clear either.
  update public.suppression_list s
  set valore_normalizzato = null, gdpr = true
  where s.rimossa_il is not null and s.valore_hash in (select valore_hash from gdpr_values);

  -- 2. Personal data.
  update public.communications
  set a = null, oggetto = null, corpo = null, contact_id = null, controllo_ammissibilita = null
  where id = any (v_communications);
  update public.activities
  set testo = null, esito = case when tipo = 'chiamata' then esito end, contact_id = null
  where party_id = any (v_parties) or opportunity_id = any (v_opportunities) or contact_id = any (v_contacts);
  update public.tasks
  set titolo = 'Promemoria', nota = null,
      completata_il = coalesce(completata_il, case when p_entita = 'parties' then now() end)
  where party_id = any (v_parties) or opportunity_id = any (v_opportunities);
  delete from public.contact_permissions where contact_id = any (v_contacts) or party_id = any (v_parties);
  delete from public.field_provenance
  where (entita = 'parties' and entita_id = any (v_parties)) or (entita = 'contacts' and entita_id = any (v_contacts));
  delete from public.external_references where entita = 'parties' and entita_id = any (v_parties);
  update public.opportunities
  set contact_id = null where contact_id = any (v_contacts);
  update public.opportunities
  set esito = 'persa', motivo_perdita = 'non_contattare', prezzo_concorrente = null, nota_perdita = null
  where id = any (v_opportunities) and esito = 'aperta';
  update public.opportunities set nota_perdita = null where id = any (v_opportunities);
  delete from public.contacts where id = any (v_contacts);
  delete from public.party_locations where id = any (v_locations);
  update public.parties
  set denominazione = case when tipo = 'azienda' then v_placeholder end,
      nome = null,
      cognome = case when tipo = 'persona' then v_placeholder end,
      piva = null, codice_fiscale = null, sito = null, dominio = null, telefono = null, email = null,
      form_web_url = null, note = null, note_modificate_da = null, note_modificate_il = null,
      dipendenti_stimati = null, non_contattare = true, gdpr_cancellato_il = now()
  where id = any (v_parties);

  -- 3. Audit: earlier entries of the erased records lose their values; one
  -- entry records the erasure, without data.
  v_ids := v_parties || v_contacts || v_locations || v_opportunities;
  update public.audit_logs
  set prima = case when prima is null then null else v_redacted end,
      dopo = case when dopo is null then null else v_redacted end
  where entita_id = any (v_ids);

  insert into public.audit_logs (utente_id, entita, entita_id, azione, prima, dopo)
  values (auth.uid(), p_entita, p_id, 'delete', null, jsonb_build_object(
    'gdpr', 'cancellazione per richiesta GDPR',
    'soggetti', cardinality(v_parties),
    'contatti', cardinality(v_contacts),
    'sedi', cardinality(v_locations),
    'opportunita', cardinality(v_opportunities),
    'email', cardinality(v_communications),
    'valori_in_esclusione', v_values
  ));

  perform set_config('crm.gdpr_erasure', 'off', true);

  return jsonb_build_object(
    'soggetti', cardinality(v_parties),
    'contatti', cardinality(v_contacts),
    'sedi', cardinality(v_locations),
    'opportunita', cardinality(v_opportunities),
    'email', cardinality(v_communications),
    'valori_in_esclusione', v_values
  );
end;
$$;

revoke all on function public.gdpr_erase(text, uuid) from public;
grant execute on function public.gdpr_erase(text, uuid) to authenticated;

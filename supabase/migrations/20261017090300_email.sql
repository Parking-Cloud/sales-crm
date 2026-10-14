-- Block 1a-7, part B: safe email (CRM-21, CRM-22), no Gmail API in 1a.
--
-- Templates: every save is a new version of the same template (famiglia_id),
-- old versions stay readable and never change. Only known variables are
-- accepted, checked when saving. No template text lives in the repository.
-- Signature: each user fills their own (name, role, phone, free text).
-- Footer: company name and the address for opposing come from app_settings
-- (set by an administrator), never from the code.
-- Permissions: an email is allowed only with a permission registered with
-- basis, source, date and author (or with cold email turned on by an
-- administrator, off by default). Imports never create permissions.
-- email_eligibility(): the check shown to the user and saved with the
-- communication; communications cannot become "approvata" or "inviata"
-- unless the check passes again in the database.

-- ---------------------------------------------------------------------------
-- Templates (B1)
-- ---------------------------------------------------------------------------

create function public.template_variables()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array['azienda', 'referente', 'parcheggio', 'indirizzo_parcheggio', 'prodotti_prezzi', 'firma']
$$;

-- Placeholders in braces that are not known variables, in order of
-- appearance, without repetitions.
create function public.template_unknown_variables(p_text text)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(array_agg(name order by first_at), '{}')
  from (
    select m[1] as name, min(ord) as first_at
    from regexp_matches(coalesce(p_text, ''), '\{([^{}]*)\}', 'g') with ordinality as t(m, ord)
    where not (m[1] = any (public.template_variables()))
    group by m[1]
  ) unknown
$$;

grant execute on function public.template_unknown_variables(text) to authenticated;

alter table public.email_templates
  add column famiglia_id uuid not null default gen_random_uuid(),
  add column attivo boolean not null default true,
  add constraint email_templates_family_version unique (famiglia_id, versione),
  add constraint email_templates_nome_length check (char_length(btrim(nome)) between 1 and 120),
  add constraint email_templates_oggetto_length check (char_length(btrim(oggetto)) between 1 and 200),
  add constraint email_templates_corpo_length check (char_length(btrim(corpo)) between 1 and 20000);

-- Unknown variables are refused; a saved version never changes (only
-- "attivo" can be switched, for the whole template).
create function public.guard_email_template()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  unknown text[];
begin
  if tg_op = 'UPDATE' then
    if (new.nome, new.uso, new.oggetto, new.corpo, new.versione, new.famiglia_id)
       is distinct from (old.nome, old.uso, old.oggetto, old.corpo, old.versione, old.famiglia_id) then
      raise exception 'a template version cannot be changed: save a new version' using errcode = '42501';
    end if;
    return new;
  end if;
  unknown := public.template_unknown_variables(new.oggetto) || public.template_unknown_variables(new.corpo);
  if cardinality(unknown) > 0 then
    raise exception 'unknown template variables: %', (
      select string_agg('{' || u || '}', ', ') from (select distinct unnest(unknown) as u) d
    ) using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_email_template() from public;

create trigger guard_email_template
  before insert or update on public.email_templates
  for each row execute function public.guard_email_template();

create trigger audit_row_change
  after insert or update or delete on public.email_templates
  for each row execute function public.audit_row_change();

-- Saves a template: a new template (p_famiglia null) or a new version of an
-- existing one. Administrators only. Returns the id of the new version.
create function public.save_email_template(
  p_famiglia uuid,
  p_nome text,
  p_uso public.template_use,
  p_oggetto text,
  p_corpo text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_family uuid := coalesce(p_famiglia, gen_random_uuid());
  v_version integer;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only administrators manage templates' using errcode = '42501';
  end if;
  if p_famiglia is not null then
    perform 1 from public.email_templates where famiglia_id = p_famiglia for update;
    if not found then
      raise exception 'template not found' using errcode = 'P0002';
    end if;
  end if;
  select coalesce(max(versione), 0) + 1 into v_version from public.email_templates where famiglia_id = v_family;
  insert into public.email_templates (famiglia_id, versione, nome, uso, oggetto, corpo)
  values (v_family, v_version, btrim(p_nome), p_uso, btrim(p_oggetto), p_corpo)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.save_email_template(uuid, text, public.template_use, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Signature (B2)
-- ---------------------------------------------------------------------------

alter table public.users
  add column firma_nome text,
  add column firma_ruolo text,
  add column firma_telefono text,
  add column firma_testo text,
  add constraint users_firma_length check (
    coalesce(char_length(firma_nome), 0) <= 120
    and coalesce(char_length(firma_ruolo), 0) <= 120
    and coalesce(char_length(firma_telefono), 0) <= 40
    and coalesce(char_length(firma_testo), 0) <= 1000
  );

-- Each user writes their own signature (users is otherwise admin-only).
create function public.save_my_signature(p_nome text, p_ruolo text, p_telefono text, p_testo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if nullif(btrim(p_nome), '') is null then
    raise exception 'the signature needs a name' using errcode = '23514';
  end if;
  update public.users
  set firma_nome = btrim(p_nome),
      firma_ruolo = nullif(btrim(p_ruolo), ''),
      firma_telefono = nullif(btrim(p_telefono), ''),
      firma_testo = nullif(btrim(p_testo), '')
  where id = auth.uid();
end;
$$;

revoke all on function public.save_my_signature(text, text, text, text) from public;
grant execute on function public.save_my_signature(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Settings of the footer and of cold email (B3, B4)
-- ---------------------------------------------------------------------------

alter table public.app_settings
  add constraint app_settings_email_footer check (
    chiave not in ('ragione_sociale', 'email_opposizione')
    or (jsonb_typeof(valore) = 'string' and char_length(btrim(valore #>> '{}')) between 2 and 200)
  ),
  add constraint app_settings_email_opposizione check (
    chiave <> 'email_opposizione' or public.is_valid_email(valore #>> '{}')
  ),
  add constraint app_settings_email_a_freddo check (
    chiave <> 'email_a_freddo' or jsonb_typeof(valore) = 'boolean'
  );

-- Cold email: off until an administrator turns it on, after legal advice.
insert into public.app_settings (chiave, valore) values ('email_a_freddo', 'false'::jsonb)
on conflict (chiave) do nothing;

-- ---------------------------------------------------------------------------
-- Permissions (B4)
-- ---------------------------------------------------------------------------

alter table public.contact_permissions
  add column nota text,
  add constraint contact_permissions_fonte_length check (fonte is null or char_length(fonte) <= 200),
  add constraint contact_permissions_nota_length check (nota is null or char_length(nota) <= 1000);

create index contact_permissions_contact on public.contact_permissions (contact_id) where contact_id is not null;
create index contact_permissions_party on public.contact_permissions (party_id) where party_id is not null;

create trigger audit_row_change
  after insert or update or delete on public.contact_permissions
  for each row execute function public.audit_row_change();

-- Registers an email permission for a contact, or for the party itself
-- (its general address) when p_contact is null. A missing address can be
-- given here and is saved on the record. Refused for "do not contact"
-- records and for addresses in the suppression list. Returns the id.
create function public.register_email_permission(
  p_contact uuid,
  p_party uuid,
  p_base public.permission_basis,
  p_fonte text default null,
  p_data timestamptz default now(),
  p_email text default null,
  p_nota text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_party uuid;
  v_email text;
  v_blocked boolean;
  v_id uuid;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_base is null then
    raise exception 'the basis of the permission is required' using errcode = '23514';
  end if;
  if p_data is null or p_data > now() + interval '1 day' then
    raise exception 'the date of the permission cannot be in the future' using errcode = '23514';
  end if;

  if p_contact is not null then
    if nullif(btrim(p_email), '') is not null then
      update public.contacts set email = btrim(p_email) where id = p_contact and email is null;
    end if;
    select c.party_id, c.email, c.non_contattare or p.non_contattare into v_party, v_email, v_blocked
    from public.contacts c join public.parties p on p.id = c.party_id
    where c.id = p_contact;
  elsif p_party is not null then
    if nullif(btrim(p_email), '') is not null then
      update public.parties set email = btrim(p_email) where id = p_party and email is null;
    end if;
    select p.id, p.email, p.non_contattare into v_party, v_email, v_blocked
    from public.parties p where p.id = p_party;
  else
    raise exception 'a contact or a party is required' using errcode = '22023';
  end if;

  if v_party is null then
    raise exception 'record not found' using errcode = 'P0002';
  end if;
  if v_email is null then
    raise exception 'the permission needs an email address' using errcode = '23514';
  end if;
  if v_blocked or public.is_suppressed(array[v_email]) then
    raise exception 'do not contact: no permission can be registered' using errcode = '42501';
  end if;

  insert into public.contact_permissions (contact_id, party_id, canale, base, fonte, data, stato, nota, created_by)
  values (p_contact, case when p_contact is null then v_party end, 'email', p_base,
          nullif(btrim(p_fonte), ''), p_data, 'attivo', nullif(btrim(p_nota), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.register_email_permission(uuid, uuid, public.permission_basis, text, timestamptz, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Eligibility (B5)
-- ---------------------------------------------------------------------------

-- The check of an email to a contact (or to the party's own address when
-- p_contact is null), written by the signed-in user. Returns:
-- { ammessa, destinatario, permesso: {base, data, fonte, operatore} | null,
--   email_a_freddo, controlli: [{ codice, ok, testo }] }.
-- Codes: destinatario, permesso, non_contattare, esclusione, firma, piede.
create function public.email_eligibility(p_party uuid, p_contact uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_party public.parties%rowtype;
  v_contact public.contacts%rowtype;
  v_email text;
  v_domain text;
  v_permission record;
  v_cold boolean;
  v_hits text;
  v_signature boolean;
  v_footer boolean;
  v_checks jsonb := '[]'::jsonb;
  v_ok boolean;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_party from public.parties where id = p_party;
  if not found then
    raise exception 'party not found' using errcode = 'P0002';
  end if;
  if p_contact is not null then
    select * into v_contact from public.contacts where id = p_contact and party_id = p_party;
    if not found then
      raise exception 'contact not found' using errcode = 'P0002';
    end if;
    v_email := v_contact.email;
  else
    v_email := v_party.email;
  end if;
  v_domain := public.normalize_domain(v_email);

  -- Recipient
  v_checks := v_checks || jsonb_build_object(
    'codice', 'destinatario', 'ok', v_email is not null,
    'testo', case when v_email is not null then 'Indirizzo email presente' else 'Manca l''indirizzo email' end);

  -- Permission (or cold email turned on)
  select cp.base, cp.data, cp.fonte, coalesce(nullif(btrim(u.nome), ''), u.email) as operatore
  into v_permission
  from public.contact_permissions cp
  left join public.users u on u.id = cp.created_by
  where cp.canale = 'email' and cp.stato = 'attivo'
    and ((p_contact is not null and cp.contact_id = p_contact) or (p_contact is null and cp.party_id = p_party and cp.contact_id is null))
  order by cp.data desc
  limit 1;
  select coalesce((select s.valore = 'true'::jsonb from public.app_settings s where s.chiave = 'email_a_freddo'), false) into v_cold;
  v_checks := v_checks || jsonb_build_object(
    'codice', 'permesso', 'ok', v_permission.base is not null or v_cold,
    'testo', case
      when v_permission.base is not null then 'Permesso registrato'
      when v_cold then 'Nessun permesso: email a freddo attiva nelle impostazioni'
      else 'Nessun permesso registrato: serve una richiesta in chiamata, un contatto in entrata o un consenso'
    end);

  -- "Do not contact" flags
  v_checks := v_checks || jsonb_build_object(
    'codice', 'non_contattare', 'ok', not (v_party.non_contattare or coalesce(v_contact.non_contattare, false)),
    'testo', case
      when v_party.non_contattare then 'Il soggetto è da non contattare'
      when coalesce(v_contact.non_contattare, false) then 'Il contatto è da non contattare'
      else 'Nessuna richiesta di non essere contattato'
    end);

  -- Suppression list: recipient, its domain, phones, party values. Only the
  -- kind of value is reported, never the value.
  select coalesce(string_agg(distinct x.t, ', '), '') into v_hits
  from (
    select v_email as v, 'email del destinatario' as t
    union all select case when not public.is_generic_domain(v_domain) then v_domain end, 'dominio del destinatario'
    union all select btrim(part), 'telefono del contatto'
      from regexp_split_to_table(coalesce(v_contact.telefono, ''), ',') part
    union all select v_party.email, 'email del soggetto'
    union all select v_party.telefono, 'telefono del soggetto'
    union all select v_party.dominio, 'dominio del soggetto'
    union all select v_party.piva, 'partita IVA del soggetto'
    union all select r.id_esterno, 'luogo Google del soggetto'
      from public.external_references r
      where r.sistema = 'google_places' and r.entita = 'parties' and r.entita_id = p_party
  ) x
  where nullif(btrim(x.v), '') is not null and public.is_suppressed(array[x.v]);
  v_checks := v_checks || jsonb_build_object(
    'codice', 'esclusione', 'ok', v_hits = '',
    'testo', case when v_hits = '' then 'Nessun dato in lista di esclusione' else 'In lista di esclusione: ' || v_hits end);

  -- Signature of the writer
  select nullif(btrim(u.firma_nome), '') is not null into v_signature from public.users u where u.id = auth.uid();
  v_checks := v_checks || jsonb_build_object(
    'codice', 'firma', 'ok', coalesce(v_signature, false),
    'testo', case when coalesce(v_signature, false) then 'Firma compilata' else 'Manca la tua firma: compilala in Impostazioni' end);

  -- Footer settings
  select count(*) = 2 into v_footer
  from public.app_settings s where s.chiave in ('ragione_sociale', 'email_opposizione');
  v_checks := v_checks || jsonb_build_object(
    'codice', 'piede', 'ok', v_footer,
    'testo', case when v_footer then 'Piede completo'
      else 'Mancano ragione sociale o indirizzo per l''opposizione: li imposta l''amministratore' end);

  select bool_and((c ->> 'ok')::boolean) into v_ok from jsonb_array_elements(v_checks) c;
  return jsonb_build_object(
    'ammessa', v_ok,
    'destinatario', v_email,
    'email_a_freddo', v_cold,
    'permesso', case when v_permission.base is not null then jsonb_build_object(
      'base', v_permission.base, 'data', v_permission.data, 'fonte', v_permission.fonte, 'operatore', v_permission.operatore) end,
    'controlli', v_checks
  );
end;
$$;

grant execute on function public.email_eligibility(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Communications (B5)
-- ---------------------------------------------------------------------------

alter table public.communications
  add column party_id uuid references public.parties (id) on delete cascade,
  add column template_id uuid references public.email_templates (id) on delete set null;

create index communications_party on public.communications (party_id);

-- An email becomes "approvata" or "inviata" only if the check passes again
-- now, in the database; the check is saved with it and the recipient must
-- be the address checked.
create function public.guard_communication()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_check jsonb;
begin
  if new.stato in ('approvata', 'inviata')
     and (tg_op = 'INSERT' or old.stato is distinct from new.stato) then
    if new.party_id is null then
      raise exception 'an email needs its party' using errcode = '23514';
    end if;
    v_check := public.email_eligibility(new.party_id, new.contact_id);
    if not (v_check ->> 'ammessa')::boolean then
      raise exception 'email not allowed: %', (
        select string_agg(c ->> 'testo', '; ') from jsonb_array_elements(v_check -> 'controlli') c where not (c ->> 'ok')::boolean
      ) using errcode = '42501';
    end if;
    if lower(btrim(coalesce(new.a, ''))) <> lower(v_check ->> 'destinatario') then
      raise exception 'the recipient is not the address checked' using errcode = '23514';
    end if;
    new.controllo_ammissibilita := v_check;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_communication() from public;

create trigger guard_communication
  before insert or update on public.communications
  for each row execute function public.guard_communication();

-- "Segna come inviata": the email sent by hand from Gmail is recorded with
-- its check, author and date, and becomes an "email" activity in the
-- history. Returns the id of the communication.
create function public.record_sent_email(
  p_party uuid,
  p_contact uuid,
  p_opportunity uuid,
  p_template uuid,
  p_oggetto text,
  p_corpo text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_check jsonb;
  v_id uuid;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if nullif(btrim(p_oggetto), '') is null or nullif(btrim(p_corpo), '') is null then
    raise exception 'subject and body are required' using errcode = '23514';
  end if;
  if p_opportunity is not null
     and not exists (select 1 from public.opportunities o where o.id = p_opportunity and o.party_id = p_party) then
    raise exception 'opportunity of another party' using errcode = '22023';
  end if;
  v_check := public.email_eligibility(p_party, p_contact);

  insert into public.communications (party_id, contact_id, opportunity_id, template_id, a, oggetto, corpo, stato, approvata_da, inviata_il, created_by)
  values (p_party, p_contact, p_opportunity, p_template, v_check ->> 'destinatario', btrim(p_oggetto), p_corpo,
          'inviata', auth.uid(), now(), auth.uid())
  returning id into v_id;

  insert into public.activities (opportunity_id, party_id, contact_id, user_id, tipo, testo, avvenuta_il, communication_id)
  values (p_opportunity, p_party, p_contact, auth.uid(), 'email', 'Email inviata: ' || btrim(p_oggetto), now(), v_id);
  return v_id;
end;
$$;

grant execute on function public.record_sent_email(uuid, uuid, uuid, uuid, text, text) to authenticated;

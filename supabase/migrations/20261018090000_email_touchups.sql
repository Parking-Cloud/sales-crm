-- Block 1a-8, part A: template versions and optional signature.
--
-- A1: every template has one active version ("corrente"), the one "Prepara
--     email" uses. Saving a new version makes it active; "Usa questa
--     versione" picks another (the change is in the audit). A version can be
--     deleted only if it is not active and no communication used it.
-- A2: the CRM signature is optional: an empty one no longer blocks an email
--     and can be cleared.

alter table public.email_templates add column corrente boolean not null default false;

update public.email_templates t
set corrente = true
where t.versione = (select max(x.versione) from public.email_templates x where x.famiglia_id = t.famiglia_id);

create unique index email_templates_one_current on public.email_templates (famiglia_id) where corrente;

-- Saves a template (p_famiglia null) or a new version, which becomes the
-- active one. Administrators only. Returns the id of the new version.
create or replace function public.save_email_template(
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
  update public.email_templates set corrente = false where famiglia_id = v_family and corrente;
  insert into public.email_templates (famiglia_id, versione, nome, uso, oggetto, corpo, corrente)
  values (v_family, v_version, btrim(p_nome), p_uso, btrim(p_oggetto), p_corpo, true)
  returning id into v_id;
  return v_id;
end;
$$;

-- "Usa questa versione": the chosen version becomes the active one.
create function public.use_template_version(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_family uuid;
begin
  if not public.is_admin() then
    raise exception 'only administrators manage templates' using errcode = '42501';
  end if;
  select famiglia_id into v_family from public.email_templates where id = p_id;
  if v_family is null then
    raise exception 'template version not found' using errcode = 'P0002';
  end if;
  update public.email_templates set corrente = false where famiglia_id = v_family and corrente and id <> p_id;
  update public.email_templates set corrente = true where id = p_id;
end;
$$;

grant execute on function public.use_template_version(uuid) to authenticated;

-- Versions used by an email, or active, cannot be deleted.
create function public.guard_email_template_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.corrente then
    raise exception 'the active version cannot be deleted' using errcode = '42501';
  end if;
  if exists (select 1 from public.communications c where c.template_id = old.id) then
    raise exception 'a version used by an email cannot be deleted' using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function public.guard_email_template_delete() from public;

create trigger guard_email_template_delete
  before delete on public.email_templates
  for each row execute function public.guard_email_template_delete();

-- Administrators delete unused versions (block 1a-7 removed every deletion).
create policy delete_admin on public.email_templates
  for delete to authenticated
  using (public.is_admin());

-- Signature: optional; an empty name clears it.
create or replace function public.save_my_signature(p_nome text, p_ruolo text, p_telefono text, p_testo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.users
  set firma_nome = nullif(btrim(p_nome), ''),
      firma_ruolo = nullif(btrim(p_ruolo), ''),
      firma_telefono = nullif(btrim(p_telefono), ''),
      firma_testo = nullif(btrim(p_testo), '')
  where id = auth.uid();
end;
$$;

-- Eligibility: same checks as block 1a-7, the signature no longer blocks.
create or replace function public.email_eligibility(p_party uuid, p_contact uuid default null)
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

  -- Signature of the writer: optional (block 1a-8). Without it {firma}
  -- stays empty; the check only says so.
  select nullif(btrim(u.firma_nome), '') is not null into v_signature from public.users u where u.id = auth.uid();
  v_checks := v_checks || jsonb_build_object(
    'codice', 'firma', 'ok', true,
    'testo', case when coalesce(v_signature, false) then 'Firma del CRM compilata'
      else 'Firma del CRM vuota: {firma} resta vuota (va bene se usi la firma di Gmail)' end);

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


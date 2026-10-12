-- Block 1a-3: normalized party and contact data, enforced in the database so
-- every write path (forms, imports, scripts) stores the same forms.

-- Web form URL, for the "Canale: form sul sito" contact channel.
alter table public.parties add column form_web_url text;

-- Several phone numbers in one field (contacts only), separated by
-- comma, semicolon or "//": each normalized, joined with ", ".
create function public.normalize_phone_list(raw text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select nullif(string_agg(public.normalize_phone(part), ', ' order by ordinality), '')
  from regexp_split_to_table(coalesce(raw, ''), '\s*(,|;|//)\s*') with ordinality as part
  where public.normalize_phone(part) is not null
$$;

-- Plain email address check; placeholders such as "Non disponibile" fail it.
create function public.is_valid_email(value text)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select value ~ '^[a-z0-9._%+\-]+@[a-z0-9]([a-z0-9\-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9\-]*[a-z0-9])?)*\.[a-z]{2,}$'
$$;

create function public.normalize_party()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.denominazione := nullif(btrim(new.denominazione), '');
  new.nome := nullif(btrim(new.nome), '');
  new.cognome := nullif(btrim(new.cognome), '');
  new.telefono := public.normalize_phone(new.telefono);
  new.email := nullif(lower(btrim(new.email)), '');
  if new.email is not null and not public.is_valid_email(new.email) then
    raise exception 'invalid email address' using errcode = '23514';
  end if;
  new.sito := nullif(btrim(new.sito), '');
  new.dominio := coalesce(public.normalize_domain(new.sito), public.normalize_domain(new.dominio));
  new.piva := public.normalize_piva(new.piva);
  new.codice_fiscale := nullif(upper(regexp_replace(coalesce(new.codice_fiscale, ''), '\s', '', 'g')), '');
  new.form_web_url := nullif(btrim(new.form_web_url), '');
  return new;
end;
$$;

create trigger normalize_party
  before insert or update on public.parties
  for each row execute function public.normalize_party();

create function public.normalize_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.telefono := public.normalize_phone_list(new.telefono);
  new.email := nullif(lower(btrim(new.email)), '');
  if new.email is not null and not public.is_valid_email(new.email) then
    raise exception 'invalid email address' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger normalize_contact
  before insert or update on public.contacts
  for each row execute function public.normalize_contact();

revoke all on function public.normalize_party() from public;
revoke all on function public.normalize_contact() from public;

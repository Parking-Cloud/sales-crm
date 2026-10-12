-- MVP tables (docs/spec.md, "Tabelle MVP"): 23 tables.
-- Conventions: uuid primary keys, created_at/updated_at on every mutable
-- table, created_by where a row has an author, Italian column names as in
-- the spec (without accents).

-- Helpers used by geographic and trigram indexes. Both are immutable so they
-- can back expression indexes; queries must call the same function to use them.

-- Point on the Earth surface for earthdistance searches. search_path is fixed
-- because older earthdistance versions call cube functions unqualified.
create function public.geo_point(lat double precision, lng double precision)
returns extensions.earth
language sql
immutable
strict
parallel safe
set search_path = extensions, pg_catalog
as $$
  select extensions.ll_to_earth(lat, lng)
$$;

-- Name used for similarity search: company name, or first and last name.
create function public.party_search_name(denominazione text, nome text, cognome text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select lower(coalesce(
    nullif(btrim(denominazione), ''),
    btrim(coalesce(nome, '') || ' ' || coalesce(cognome, ''))
  ))
$$;

-- ---------------------------------------------------------------------------
-- Users and car parks
-- ---------------------------------------------------------------------------

-- One row per allowed person. Rows are created by scripts/sync-allowed-users.ts
-- before the first login; id becomes the auth.users id when the person signs
-- in (see the auth link trigger), so other tables reference it with
-- on update cascade. No foreign key to auth.users: unlinked rows have no
-- auth user yet.
create table public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nome text,
  ruolo public.user_role not null default 'operatore',
  firma_email text,
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_lowercase check (email = lower(btrim(email))),
  constraint users_email_domain check (email like '%@parkingcloud.eu')
);

create table public.parking_facilities (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo public.parking_type not null,
  indirizzo text,
  lat double precision,
  lng double precision,
  capacita integer,
  posti_commerciali integer,
  raggio_m integer,
  responsabile_id uuid references public.users (id) on update cascade on delete set null,
  stato_campagna public.campaign_status not null default 'bozza',
  archived_at timestamptz,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parking_facilities_lat_range check (lat between -90 and 90),
  constraint parking_facilities_lng_range check (lng between -180 and 180),
  constraint parking_facilities_capacita_positive check (capacita >= 0),
  constraint parking_facilities_posti_commerciali_positive check (posti_commerciali >= 0),
  constraint parking_facilities_raggio_positive check (raggio_m > 0)
);

-- CRM-02 and CRM-03. giorni is free text ("5/7", "7/7") as in the spec.
create table public.parking_products (
  id uuid primary key default gen_random_uuid(),
  parking_id uuid not null references public.parking_facilities (id) on delete cascade,
  nome text not null,
  tipo public.product_type not null,
  giorni text,
  ora_da time,
  ora_a time,
  periodo public.product_period,
  prezzo_netto numeric(10, 2),
  iva_pct numeric(5, 2),
  posti_disponibili integer,
  note text,
  attivo boolean not null default true,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parking_products_prezzo_positive check (prezzo_netto >= 0),
  constraint parking_products_iva_range check (iva_pct between 0 and 100),
  constraint parking_products_posti_positive check (posti_disponibili >= 0)
);

-- ---------------------------------------------------------------------------
-- Parties (companies and people), locations, contacts
-- ---------------------------------------------------------------------------

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  tipo public.party_type not null,
  denominazione text,
  nome text,
  cognome text,
  categoria text,
  piva text,
  codice_fiscale text,
  sito text,
  dominio text,
  telefono text,
  email text,
  dipendenti_stimati integer,
  parcheggio_privato public.private_parking not null default 'non_noto',
  non_contattare boolean not null default false,
  merged_into_id uuid references public.parties (id) on delete set null,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parties_name_present check (
    (tipo = 'azienda' and nullif(btrim(denominazione), '') is not null)
    or (tipo = 'persona' and coalesce(nullif(btrim(nome), ''), nullif(btrim(cognome), '')) is not null)
  ),
  constraint parties_piva_not_blank check (btrim(piva) <> ''),
  constraint parties_not_merged_into_self check (merged_into_id <> id),
  constraint parties_dipendenti_positive check (dipendenti_stimati >= 0)
);

create table public.party_locations (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties (id) on delete cascade,
  indirizzo text,
  cap text,
  citta text,
  lat double precision,
  lng double precision,
  principale boolean not null default false,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint party_locations_lat_range check (lat between -90 and 90),
  constraint party_locations_lng_range check (lng between -180 and 180)
);

-- CRM-10
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties (id) on delete cascade,
  nome text,
  cognome text,
  ruolo text,
  email text,
  telefono text,
  canale_preferito public.contact_channel,
  non_contattare boolean not null default false,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Campaigns, opportunities, activities, tasks
-- ---------------------------------------------------------------------------

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  parking_id uuid not null references public.parking_facilities (id) on delete cascade,
  nome text not null,
  categorie text[] not null default '{}',
  periodo daterange,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties (id) on delete restrict,
  parking_id uuid not null references public.parking_facilities (id) on delete restrict,
  contact_id uuid references public.contacts (id) on delete set null,
  responsabile_id uuid references public.users (id) on update cascade on delete set null,
  fase public.opportunity_stage not null default 'individuata',
  esito public.opportunity_outcome not null default 'aperta',
  motivo_perdita public.loss_reason,
  prezzo_concorrente numeric(10, 2),
  prodotto_interesse_id uuid references public.parking_products (id) on delete set null,
  posti_richiesti integer,
  valore_mensile_stimato numeric(12, 2),
  prossima_attivita_il timestamptz,
  campaign_id uuid references public.campaigns (id) on delete set null,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- CRM-17: a lost opportunity needs a reason.
  constraint opportunities_lost_needs_reason check (esito <> 'persa' or motivo_perdita is not null),
  constraint opportunities_prezzo_concorrente_positive check (prezzo_concorrente >= 0),
  constraint opportunities_posti_positive check (posti_richiesti >= 0),
  constraint opportunities_valore_positive check (valore_mensile_stimato >= 0)
);

-- Only one open opportunity per party and car park.
create unique index opportunities_one_open_per_party_parking
  on public.opportunities (party_id, parking_id)
  where esito = 'aperta';

create table public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_recipients_unique unique (campaign_id, opportunity_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  assegnatario_id uuid references public.users (id) on update cascade on delete set null,
  titolo text not null,
  scadenza timestamptz,
  completata_il timestamptz,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Email templates and communications
-- ---------------------------------------------------------------------------

create table public.email_templates (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  uso public.template_use not null,
  oggetto text not null,
  corpo text not null,
  versione integer not null default 1,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_templates_versione_positive check (versione > 0)
);

-- "a" is the recipient address, as named in the spec.
create table public.communications (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  a text,
  oggetto text,
  corpo text,
  stato public.communication_status not null default 'bozza',
  controllo_ammissibilita jsonb,
  approvata_da uuid references public.users (id) on update cascade on delete set null,
  inviata_il timestamptz,
  gmail_message_id text unique,
  gmail_thread_id text,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities (id) on delete cascade,
  party_id uuid references public.parties (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  user_id uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  tipo public.activity_type not null,
  esito text,
  testo text,
  avvenuta_il timestamptz not null default now(),
  communication_id uuid references public.communications (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_has_subject check (opportunity_id is not null or party_id is not null)
);

-- ---------------------------------------------------------------------------
-- Offers and backoffice handoff
-- ---------------------------------------------------------------------------

-- condizioni holds the RF-54 parameters (frequency, timing, duration, renewal,
-- notice, energy, deposit, discount); their shape is defined in block 1b-2.
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities (id) on delete cascade,
  versione integer not null default 1,
  stato public.offer_status not null default 'bozza',
  inviata_il timestamptz,
  accettata_il timestamptz,
  motivo_rifiuto text,
  valida_fino date,
  condizioni jsonb,
  pdf_path text,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offers_opportunity_version_unique unique (opportunity_id, versione),
  constraint offers_versione_positive check (versione > 0)
);

-- frequenza_pagamento is free text until the platform defines its plans
-- (spec, Fase 3 area A).
create table public.offer_items (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  prodotto_id uuid references public.parking_products (id) on delete set null,
  descrizione text,
  posti integer,
  prezzo_netto numeric(10, 2),
  sconto_pct numeric(5, 2),
  iva_pct numeric(5, 2),
  durata_mesi integer,
  decorrenza date,
  frequenza_pagamento text,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offer_items_posti_positive check (posti >= 0),
  constraint offer_items_prezzo_positive check (prezzo_netto >= 0),
  constraint offer_items_sconto_range check (sconto_pct between 0 and 100),
  constraint offer_items_iva_range check (iva_pct between 0 and 100),
  constraint offer_items_durata_positive check (durata_mesi > 0)
);

create table public.backoffice_handoffs (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null unique references public.offers (id) on delete restrict,
  stato public.handoff_status not null default 'da_prendere_in_carico',
  assegnatario_id uuid references public.users (id) on update cascade on delete set null,
  trasferita_il timestamptz,
  presa_il timestamptz,
  rif_cliente_bo text,
  rif_contratto_bo text,
  snapshot jsonb,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- External references, data sources and provenance
-- ---------------------------------------------------------------------------

-- entita is the table name, entita_id the row id (polymorphic link).
create table public.external_references (
  id uuid primary key default gen_random_uuid(),
  entita text not null,
  entita_id uuid not null,
  sistema public.external_system not null,
  id_esterno text not null,
  letto_il timestamptz,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_references_system_id_unique unique (sistema, id_esterno)
);

create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  licenza text,
  conservazione_giorni integer,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint data_sources_conservazione_positive check (conservazione_giorni > 0)
);

-- One row per sensitive field of an entity (CRM-09).
create table public.field_provenance (
  id uuid primary key default gen_random_uuid(),
  entita text not null,
  entita_id uuid not null,
  campo text not null,
  fonte_id uuid references public.data_sources (id) on delete restrict,
  acquisito_il timestamptz,
  verificato_il timestamptz,
  stato public.data_status not null default 'da_verificare',
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_provenance_one_per_field unique (entita, entita_id, campo)
);

-- ---------------------------------------------------------------------------
-- Contact permissions and suppression list
-- ---------------------------------------------------------------------------

-- created_by is the operator who recorded the permission.
create table public.contact_permissions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts (id) on delete cascade,
  party_id uuid references public.parties (id) on delete cascade,
  canale public.contact_channel not null,
  base public.permission_basis not null,
  fonte text,
  data timestamptz not null default now(),
  stato public.permission_status not null default 'attivo',
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_permissions_has_subject check (contact_id is not null or party_id is not null)
);

-- Values are stored already normalized (lower case, trimmed; phone numbers
-- in +39 form, normalized by the application).
create table public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  tipo public.suppression_type not null,
  valore_normalizzato text not null unique,
  motivo text,
  created_by uuid default auth.uid() references public.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suppression_list_normalized check (
    valore_normalizzato = lower(btrim(valore_normalizzato)) and valore_normalizzato <> ''
  )
);

-- ---------------------------------------------------------------------------
-- Append-only tables
-- ---------------------------------------------------------------------------

-- Written only by the audit trigger. utente_id has no foreign key on purpose:
-- the log must survive user deletion unchanged.
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  utente_id uuid,
  entita text not null,
  entita_id uuid,
  azione public.audit_action not null,
  prima jsonb,
  dopo jsonb,
  quando timestamptz not null default now()
);

-- Same reason for utente_id: an append-only row cannot follow cascades.
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  file text not null,
  utente_id uuid default auth.uid(),
  conteggi jsonb not null default '{}'::jsonb,
  annullato_il timestamptz,
  created_at timestamptz not null default now()
);

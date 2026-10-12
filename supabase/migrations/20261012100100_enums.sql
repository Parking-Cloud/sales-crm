-- Enumerated types. Values follow docs/spec.md ("Modello dati" and
-- "Requisiti funzionali Fase 1"); labels are Italian, lower snake case.

create type public.user_role as enum ('admin', 'operatore');

create type public.party_type as enum ('azienda', 'persona');

create type public.opportunity_stage as enum (
  'individuata',
  'da_contattare',
  'contattata',
  'interessata',
  'offerta_inviata',
  'vinta',
  'passata_bo',
  'attivata'
);

create type public.opportunity_outcome as enum ('aperta', 'vinta', 'persa');

-- CRM-17: fixed list of loss reasons.
create type public.loss_reason as enum (
  'mezzi_pubblici',
  'ha_gia_parcheggio',
  'trasloco',
  'prezzo',
  'nessun_bisogno',
  'non_raggiungibile',
  'altro'
);

-- CRM-09: status of a stored data point.
create type public.data_status as enum ('verificato', 'stimato', 'da_verificare');

create type public.activity_type as enum (
  'chiamata',
  'email',
  'nota',
  'incontro',
  'cambio_fase'
);

create type public.communication_status as enum (
  'bozza',
  'approvata',
  'inviata',
  'fallita'
);

-- CRM-26
create type public.offer_status as enum (
  'bozza',
  'inviata',
  'accettata',
  'rifiutata',
  'scaduta'
);

-- CRM-27
create type public.handoff_status as enum (
  'da_prendere_in_carico',
  'presa_in_carico',
  'attivata',
  'bloccata'
);

-- CRM-01
create type public.parking_type as enum ('autorimessa', 'aziendale');

create type public.campaign_status as enum ('bozza', 'attiva', 'in_pausa', 'chiusa');

-- CRM-02
create type public.product_type as enum (
  'abbonamento',
  'sosta_breve',
  'carnet',
  'convenzione',
  'servizio_aggiuntivo'
);

create type public.product_period as enum ('ora', 'giorno', 'mese', 'anno');

create type public.private_parking as enum ('si', 'no', 'non_noto');

-- Channels named in the spec: phone, email and the web form found in the Excel.
create type public.contact_channel as enum ('telefono', 'email', 'form_web');

create type public.template_use as enum ('uffici', 'attivita_commerciali', 'offerta');

create type public.external_system as enum ('google_places', 'backoffice', 'excel');

-- "Regole sulle comunicazioni commerciali": the three ways an email becomes allowed.
create type public.permission_basis as enum (
  'richiesta_in_chiamata',
  'contatto_in_entrata',
  'consenso'
);

create type public.permission_status as enum ('attivo', 'revocato');

create type public.suppression_type as enum ('email', 'telefono', 'dominio');

create type public.audit_action as enum ('insert', 'update', 'delete');

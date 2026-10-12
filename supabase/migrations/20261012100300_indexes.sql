-- Indexes: foreign keys, similarity search, geographic search, reminders.

-- VAT number unique only when present.
create unique index parties_piva_unique on public.parties (piva) where piva is not null;

-- Trigram similarity on the party name (dedup rule 3, similarity >= 0.6).
create index parties_search_name_trgm
  on public.parties using gin (
    public.party_search_name(denominazione, nome, cognome) extensions.gin_trgm_ops
  );

-- Geographic searches: query with earth_box(public.geo_point(lat, lng), radius).
create index parking_facilities_geo
  on public.parking_facilities using gist (public.geo_point(lat, lng));
create index party_locations_geo
  on public.party_locations using gist (public.geo_point(lat, lng));

-- One main location per party.
create unique index party_locations_one_main
  on public.party_locations (party_id) where principale;

-- Reminders ("Oggi"): open opportunities by next activity date.
create index opportunities_prossima_attivita_il
  on public.opportunities (prossima_attivita_il) where esito = 'aperta';

-- Polymorphic lookups.
create index external_references_entity on public.external_references (entita, entita_id);
create index audit_logs_entity on public.audit_logs (entita, entita_id, quando);
create index communications_gmail_thread_id on public.communications (gmail_thread_id);
create index parties_dominio on public.parties (dominio);
create index parties_telefono on public.parties (telefono);

-- Foreign keys.
create index parking_facilities_responsabile_id on public.parking_facilities (responsabile_id);
create index parking_facilities_created_by on public.parking_facilities (created_by);
create index parking_products_parking_id on public.parking_products (parking_id);
create index parking_products_created_by on public.parking_products (created_by);
create index parties_merged_into_id on public.parties (merged_into_id);
create index parties_created_by on public.parties (created_by);
create index party_locations_party_id on public.party_locations (party_id);
create index party_locations_created_by on public.party_locations (created_by);
create index contacts_party_id on public.contacts (party_id);
create index contacts_created_by on public.contacts (created_by);
create index campaigns_parking_id on public.campaigns (parking_id);
create index campaigns_created_by on public.campaigns (created_by);
create index opportunities_party_id on public.opportunities (party_id);
create index opportunities_parking_id on public.opportunities (parking_id);
create index opportunities_contact_id on public.opportunities (contact_id);
create index opportunities_responsabile_id on public.opportunities (responsabile_id);
create index opportunities_prodotto_interesse_id on public.opportunities (prodotto_interesse_id);
create index opportunities_campaign_id on public.opportunities (campaign_id);
create index opportunities_created_by on public.opportunities (created_by);
create index campaign_recipients_opportunity_id on public.campaign_recipients (opportunity_id);
create index campaign_recipients_created_by on public.campaign_recipients (created_by);
create index tasks_opportunity_id on public.tasks (opportunity_id);
create index tasks_assegnatario_id on public.tasks (assegnatario_id);
create index tasks_created_by on public.tasks (created_by);
create index email_templates_created_by on public.email_templates (created_by);
create index communications_opportunity_id on public.communications (opportunity_id);
create index communications_contact_id on public.communications (contact_id);
create index communications_approvata_da on public.communications (approvata_da);
create index communications_created_by on public.communications (created_by);
create index activities_opportunity_id on public.activities (opportunity_id);
create index activities_party_id on public.activities (party_id);
create index activities_contact_id on public.activities (contact_id);
create index activities_user_id on public.activities (user_id);
create index activities_communication_id on public.activities (communication_id);
create index offers_created_by on public.offers (created_by);
create index offer_items_offer_id on public.offer_items (offer_id);
create index offer_items_prodotto_id on public.offer_items (prodotto_id);
create index offer_items_created_by on public.offer_items (created_by);
create index backoffice_handoffs_assegnatario_id on public.backoffice_handoffs (assegnatario_id);
create index backoffice_handoffs_created_by on public.backoffice_handoffs (created_by);
create index external_references_created_by on public.external_references (created_by);
create index data_sources_created_by on public.data_sources (created_by);
create index field_provenance_fonte_id on public.field_provenance (fonte_id);
create index field_provenance_created_by on public.field_provenance (created_by);
create index contact_permissions_contact_id on public.contact_permissions (contact_id);
create index contact_permissions_party_id on public.contact_permissions (party_id);
create index contact_permissions_created_by on public.contact_permissions (created_by);
create index suppression_list_created_by on public.suppression_list (created_by);
create index import_batches_utente_id on public.import_batches (utente_id);

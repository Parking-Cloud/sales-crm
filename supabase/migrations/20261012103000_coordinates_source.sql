-- Where stored coordinates come from, and when they were last set.
-- - nominatim: OpenStreetMap Nominatim, confirmed by a user (kept, with attribution);
-- - manuale: typed in by a user;
-- - google: Google Places, to be deleted within 30 days (block 1a-5).
alter table public.parking_facilities
  add column coordinate_fonte text,
  add column coordinate_aggiornate_il timestamptz,
  add constraint parking_facilities_coordinate_fonte_check
    check (coordinate_fonte in ('nominatim', 'manuale', 'google'));

alter table public.party_locations
  add column coordinate_fonte text,
  add column coordinate_aggiornate_il timestamptz,
  add constraint party_locations_coordinate_fonte_check
    check (coordinate_fonte in ('nominatim', 'manuale', 'google'));

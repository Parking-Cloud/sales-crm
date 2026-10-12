-- Block 1a-2: postcode, city and notes for car parks (form fields of CRM-01),
-- kept separate from the free-text address so the list can show the city.
alter table public.parking_facilities
  add column cap text,
  add column citta text,
  add column note text;

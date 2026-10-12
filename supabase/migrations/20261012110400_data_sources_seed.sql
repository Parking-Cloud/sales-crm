-- Block 1a-3: data sources offered in the provenance form (CRM-09). They are
-- configuration, not personal data. Only administrators can change them.
insert into public.data_sources (nome) values
  ('Sito aziendale'),
  ('Telefonata'),
  ('Google Places'),
  ('Import Excel'),
  ('Inserimento manuale'),
  ('Altro')
on conflict (nome) do nothing;

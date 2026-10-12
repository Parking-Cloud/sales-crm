-- Extensions used by the CRM schema. On Supabase they live in the
-- "extensions" schema, which is on the default search_path of API roles.
create schema if not exists extensions;

-- Trigram similarity for duplicate detection on party names.
create extension if not exists pg_trgm with schema extensions;

-- Great-circle distances for "companies near a car park" searches.
create extension if not exists cube with schema extensions;
create extension if not exists earthdistance with schema extensions;

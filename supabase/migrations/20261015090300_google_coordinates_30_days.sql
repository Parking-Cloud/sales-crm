-- Block 1a-5: Google coordinates are kept at most 30 days.
-- - A nightly job re-reads them after 25 days (Place Details, location only):
--   google_locations_due() lists them, apply_google_coordinates() saves.
-- - Safety net: Google coordinates older than 30 days are never used
--   (google_coordinates_valid; distances below).
-- - A location whose address an operator confirms is geocoded with
--   Nominatim (coordinate_fonte = 'nominatim') and leaves the Google cycle.

create function public.google_coordinates_valid(p_fonte text, p_aggiornate_il timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_fonte is distinct from 'google'
      or (p_aggiornate_il is not null and p_aggiornate_il >= now() - interval '30 days')
$$;

grant execute on function public.google_coordinates_valid(text, timestamptz) to authenticated, service_role;

-- Locations with Google coordinates older than p_days, with their place_id,
-- oldest first. For the nightly job (service role) and the "Aggiorna" button.
create function public.google_locations_due(p_limit integer default 200, p_days integer default 25)
returns table (location_id uuid, place_id text, aggiornate_il timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id, r.id_esterno, l.coordinate_aggiornate_il
  from public.party_locations l
  join public.external_references r
    on r.sistema = 'google_places' and r.entita = 'parties' and r.entita_id = l.party_id
  where l.coordinate_fonte = 'google'
    and (l.coordinate_aggiornate_il is null or l.coordinate_aggiornate_il < now() - make_interval(days => p_days))
  order by l.coordinate_aggiornate_il nulls first
  limit least(greatest(p_limit, 0), 200)
$$;

grant execute on function public.google_locations_due(integer, integer) to authenticated, service_role;

-- Saves re-read coordinates: [{ location_id, lat, lng }]. lat/lng null (the
-- place no longer exists) clears them. Only locations still on Google
-- coordinates are touched. Returns { aggiornate, cancellate }.
create function public.apply_google_coordinates(p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_updated integer;
  v_cleared integer;
begin
  with input as (
    select (x ->> 'location_id')::uuid as id, (x ->> 'lat')::double precision as lat, (x ->> 'lng')::double precision as lng
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
  )
  update public.party_locations l
  set lat = i.lat, lng = i.lng, coordinate_aggiornate_il = now()
  from input i
  where l.id = i.id and l.coordinate_fonte = 'google' and i.lat is not null and i.lng is not null;
  get diagnostics v_updated = row_count;

  with input as (
    select (x ->> 'location_id')::uuid as id
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
    where x ->> 'lat' is null or x ->> 'lng' is null
  )
  update public.party_locations l
  set lat = null, lng = null, coordinate_fonte = null, coordinate_aggiornate_il = null
  from input i
  where l.id = i.id and l.coordinate_fonte = 'google';
  get diagnostics v_cleared = row_count;

  return jsonb_build_object('aggiornate', v_updated, 'cancellate', v_cleared);
end;
$$;

grant execute on function public.apply_google_coordinates(jsonb) to authenticated, service_role;

-- Distances: same as before, without Google coordinates older than 30 days.
create or replace function public.party_location_distances(p_party_id uuid, p_max_m integer default null)
returns table (location_id uuid, parking_id uuid, parcheggio text, distanza_m integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with radius as (
    select coalesce(
      p_max_m,
      (select s.valore::text::integer from public.app_settings s where s.chiave = 'distanza_massima_parcheggi_m'),
      5000
    ) as max_m
  ),
  d as (
    select l.id as location_id, f.id as parking_id, f.nome as parcheggio,
           round(extensions.earth_distance(public.geo_point(l.lat, l.lng), public.geo_point(f.lat, f.lng)))::integer as distanza_m
    from public.party_locations l
    cross join public.parking_facilities f
    where l.party_id = p_party_id
      and l.lat is not null and l.lng is not null
      and public.google_coordinates_valid(l.coordinate_fonte, l.coordinate_aggiornate_il)
      and f.archived_at is null and f.lat is not null and f.lng is not null
  )
  select d.location_id, d.parking_id, d.parcheggio, d.distanza_m
  from d, radius
  where d.distanza_m <= radius.max_m
  order by d.location_id, d.distanza_m, d.parcheggio
$$;

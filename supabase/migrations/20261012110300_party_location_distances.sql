-- Block 1a-3: straight-line distance from each geocoded party location to
-- every active (not archived) geocoded car park, computed in the database
-- with earthdistance. Runs with the caller's rights (RLS applies).
create function public.party_location_distances(p_party_id uuid)
returns table (location_id uuid, parking_id uuid, parcheggio text, distanza_m integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.id,
    f.id,
    f.nome,
    round(extensions.earth_distance(public.geo_point(l.lat, l.lng), public.geo_point(f.lat, f.lng)))::integer
  from public.party_locations l
  cross join public.parking_facilities f
  where l.party_id = p_party_id
    and l.lat is not null and l.lng is not null
    and f.archived_at is null
    and f.lat is not null and f.lng is not null
  order by l.id, 4
$$;

grant execute on function public.party_location_distances(uuid) to authenticated;

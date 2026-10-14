-- Distances location -> car park limited to a maximum radius, nearest first.
-- p_max_m null: the radius saved in app_settings (5 km if missing).
-- Replaces the version without a radius.
drop function public.party_location_distances(uuid);

create function public.party_location_distances(p_party_id uuid, p_max_m integer default null)
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
      and f.archived_at is null and f.lat is not null and f.lng is not null
  )
  select d.location_id, d.parking_id, d.parcheggio, d.distanza_m
  from d, radius
  where d.distanza_m <= radius.max_m
  order by d.location_id, d.distanza_m, d.parcheggio
$$;

grant execute on function public.party_location_distances(uuid, integer) to authenticated;

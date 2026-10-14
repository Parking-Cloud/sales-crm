-- Block 1a-7, part A: parties enter the pipeline from their page, from the
-- party list (several at once) and from the new-party form.
--
-- opportunities.origine: how a manually added lead arrived (A2).
-- party_parking_options(): car parks to choose from, with the distance from
-- the party's locations when it can be computed and the open opportunity on
-- the pair, if any.
-- add_to_parking(): one opportunity per party on a car park, assigned to
-- whoever creates it; parties with an open opportunity on that car park,
-- merged ones and "do not contact" ones are skipped with the reason.

alter table public.opportunities
  add column origine text,
  add constraint opportunities_origine_check
    check (origine is null or origine in ('contatto_in_entrata', 'segnalazione', 'altro'));

create function public.party_parking_options(p_party uuid)
returns table (parking_id uuid, nome text, distanza_m integer, opportunity_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select f.id,
         coalesce(f.nome_breve, f.nome),
         (select min(round(extensions.earth_distance(public.geo_point(l.lat, l.lng), public.geo_point(f.lat, f.lng))))::integer
          from public.party_locations l
          where l.party_id = p_party
            and l.lat is not null and l.lng is not null
            and public.google_coordinates_valid(l.coordinate_fonte, l.coordinate_aggiornate_il)
            and f.lat is not null and f.lng is not null),
         (select o.id from public.opportunities o
          where o.party_id = p_party and o.parking_id = f.id and o.esito = 'aperta'
          limit 1)
  from public.parking_facilities f
  where f.archived_at is null
  order by 3 nulls last, 2
$$;

grant execute on function public.party_parking_options(uuid) to authenticated;

create function public.add_to_parking(
  p_parties uuid[],
  p_parking uuid,
  p_fase public.opportunity_stage default 'individuata',
  p_origine text default null
)
returns table (party_id uuid, esito text, opportunity_id uuid, motivo text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_party uuid;
  v_row public.parties%rowtype;
  v_existing uuid;
  v_new uuid;
begin
  if not public.is_active_user() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_fase not in ('individuata', 'da_contattare', 'contattata', 'interessata') then
    raise exception 'a new opportunity starts in an early stage' using errcode = '22023';
  end if;
  if not exists (select 1 from public.parking_facilities f where f.id = p_parking and f.archived_at is null) then
    raise exception 'car park not found or archived' using errcode = 'P0002';
  end if;

  foreach v_party in array coalesce(p_parties, '{}') loop
    select * into v_row from public.parties p where p.id = v_party;
    party_id := v_party;
    opportunity_id := null;
    if not found then
      esito := 'saltata'; motivo := 'Soggetto non trovato';
    elsif v_row.merged_into_id is not null then
      esito := 'saltata'; motivo := 'Soggetto unito a un altro';
    elsif v_row.non_contattare then
      esito := 'saltata'; motivo := 'Soggetto da non contattare';
    else
      select o.id into v_existing from public.opportunities o
      where o.party_id = v_party and o.parking_id = p_parking and o.esito = 'aperta';
      if v_existing is not null then
        esito := 'saltata'; motivo := 'Ha già un''opportunità aperta su questo parcheggio'; opportunity_id := v_existing;
      else
        begin
          insert into public.opportunities (party_id, parking_id, fase, responsabile_id, origine)
          values (v_party, p_parking, p_fase, auth.uid(), p_origine)
          returning id into v_new;
          esito := 'creata'; motivo := null; opportunity_id := v_new;
        exception when unique_violation then
          esito := 'saltata'; motivo := 'Ha già un''opportunità aperta su questo parcheggio';
          select o.id into opportunity_id from public.opportunities o
          where o.party_id = v_party and o.parking_id = p_parking and o.esito = 'aperta';
        end;
      end if;
    end if;
    v_existing := null;
    return next;
  end loop;
end;
$$;

grant execute on function public.add_to_parking(uuid[], uuid, public.opportunity_stage, text) to authenticated;

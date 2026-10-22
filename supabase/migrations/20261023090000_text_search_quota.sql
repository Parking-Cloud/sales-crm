-- Block 1a-10: keyword search with Text Search (New), billed as Text Search
-- Pro and counted in api_usage under its own SKU. Searches share one daily
-- limit: "limite_giornaliero_nearby" covers Nearby Search and Text Search
-- together (the calls of both SKUs today are added up).

alter table public.api_usage drop constraint api_usage_sku;
alter table public.api_usage add constraint api_usage_sku check (sku in (
  'nearby_search_pro', 'text_search_pro', 'place_details_enterprise', 'place_details_essentials', 'route_matrix_essentials'
));

create or replace function public.use_api_quota(p_sku text, p_n integer default 1)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Europe/Rome')::date;
  v_key text;
  v_limit integer;
  v_used integer;
  v_shared text[];
begin
  if auth.uid() is not null and not public.is_active_user() then
    raise exception 'not an active user' using errcode = '42501';
  end if;
  if p_n is null or p_n < 1 or p_n > 1000 then
    raise exception 'invalid number of calls' using errcode = '22023';
  end if;

  v_key := case p_sku
    when 'nearby_search_pro' then 'limite_giornaliero_nearby'
    when 'text_search_pro' then 'limite_giornaliero_nearby'
    when 'place_details_enterprise' then 'limite_giornaliero_details'
  end;
  -- SKUs counted against the same limit.
  v_shared := case when v_key = 'limite_giornaliero_nearby' then array['nearby_search_pro', 'text_search_pro'] else array[p_sku] end;
  if v_key is not null then
    select valore::text::integer into v_limit from public.app_settings where chiave = v_key;
  end if;

  insert into public.api_usage (giorno, sku, chiamate)
  select v_day, s, 0 from unnest(v_shared) s
  on conflict (giorno, sku) do nothing;
  perform 1 from public.api_usage where giorno = v_day and sku = any (v_shared) order by sku for update;
  select coalesce(sum(chiamate), 0)::integer into v_used from public.api_usage where giorno = v_day and sku = any (v_shared);

  if v_limit is not null and v_used + p_n > v_limit then
    return jsonb_build_object('ok', false, 'usate', v_used, 'limite', v_limit);
  end if;

  update public.api_usage set chiamate = chiamate + p_n, updated_at = now()
  where giorno = v_day and sku = p_sku;
  return jsonb_build_object('ok', true, 'usate', v_used + p_n, 'limite', v_limit);
end;
$$;

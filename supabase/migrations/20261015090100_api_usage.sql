-- Block 1a-5: Google Maps Platform usage and daily limits.
--
-- api_usage: billed requests per day (Europe/Rome) and SKU. Route Matrix is
-- billed per element (origins x destinations): its rows count elements.
-- Rows are written only through use_api_quota(), which reserves the calls
-- before they are made and refuses them over the daily limit.

create table public.api_usage (
  giorno date not null,
  sku text not null,
  chiamate integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (giorno, sku),
  constraint api_usage_sku check (sku in (
    'nearby_search_pro', 'place_details_enterprise', 'place_details_essentials', 'route_matrix_essentials'
  )),
  constraint api_usage_chiamate_positive check (chiamate >= 0)
);

alter table public.api_usage enable row level security;
grant select on public.api_usage to authenticated;
create policy read_active_users on public.api_usage
  for select to authenticated using (public.is_active_user());

-- Daily limits, set by the administrator in /impostazioni.
alter table public.app_settings add constraint app_settings_limiti_api check (
  chiave not in ('limite_giornaliero_nearby', 'limite_giornaliero_details')
  or (jsonb_typeof(valore) = 'number' and valore::text ~ '^\d+$' and valore::text::integer between 0 and 100000)
);
insert into public.app_settings (chiave, valore) values
  ('limite_giornaliero_nearby', '500'::jsonb),
  ('limite_giornaliero_details', '300'::jsonb);

-- Reserves p_n calls of a SKU for today. Returns { ok, usate, limite }:
-- ok false (and nothing counted) when the daily limit would be exceeded.
-- SKUs without a limit are only counted. Callable by active users and by
-- server jobs without a user (service role).
create function public.use_api_quota(p_sku text, p_n integer default 1)
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
begin
  if auth.uid() is not null and not public.is_active_user() then
    raise exception 'not an active user' using errcode = '42501';
  end if;
  if p_n is null or p_n < 1 or p_n > 1000 then
    raise exception 'invalid number of calls' using errcode = '22023';
  end if;

  v_key := case p_sku
    when 'nearby_search_pro' then 'limite_giornaliero_nearby'
    when 'place_details_enterprise' then 'limite_giornaliero_details'
  end;
  if v_key is not null then
    select valore::text::integer into v_limit from public.app_settings where chiave = v_key;
  end if;

  insert into public.api_usage (giorno, sku, chiamate) values (v_day, p_sku, 0)
  on conflict (giorno, sku) do nothing;
  select chiamate into v_used from public.api_usage where giorno = v_day and sku = p_sku for update;

  if v_limit is not null and v_used + p_n > v_limit then
    return jsonb_build_object('ok', false, 'usate', v_used, 'limite', v_limit);
  end if;

  update public.api_usage set chiamate = chiamate + p_n, updated_at = now()
  where giorno = v_day and sku = p_sku;
  return jsonb_build_object('ok', true, 'usate', v_used + p_n, 'limite', v_limit);
end;
$$;

revoke all on function public.use_api_quota(text, integer) from public;
grant execute on function public.use_api_quota(text, integer) to authenticated, service_role;

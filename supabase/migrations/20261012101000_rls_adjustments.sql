-- Permission decisions taken after block 1a-1 review.
--
-- - parking_facilities and parking_products: written by administrators only;
--   operators read. (guard_product_prices stays as a second line of defense.)
-- - suppression_list: administrators and operators add entries; only
--   administrators update or delete them.

drop policy insert_active_users on public.parking_facilities;
drop policy update_active_users on public.parking_facilities;
drop policy insert_active_users on public.parking_products;
drop policy update_active_users on public.parking_products;
drop policy update_active_users on public.suppression_list;

create policy insert_admin on public.parking_facilities
  for insert to authenticated
  with check (public.is_admin());

create policy update_admin on public.parking_facilities
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy insert_admin on public.parking_products
  for insert to authenticated
  with check (public.is_admin());

create policy update_admin on public.parking_products
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy update_admin on public.suppression_list
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

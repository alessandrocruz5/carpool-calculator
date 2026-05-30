-- Phase 1: Group-scoped RLS policies
-- Replaces the flat is_member/is_driver helpers and all old policies.

-----------------------------------------------------------------------
-- 1. Security-definer helpers
-----------------------------------------------------------------------
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select exists (
    select 1 from public.members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_driver(gid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select exists (
    select 1 from public.members
    where group_id = gid
      and user_id = auth.uid()
      and role in ('driver','both')
  );
$$;

grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_driver(uuid) to authenticated;

-- Revoke anon access to all security definer functions
revoke execute on function public.is_group_member(uuid) from anon;
revoke execute on function public.is_group_driver(uuid) from anon;
revoke execute on function public.handle_new_user() from anon, authenticated;

-----------------------------------------------------------------------
-- 2. Drop ALL old policies from 0003 (flat membership model)
-----------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'passengers','gas_prices','fillups','settings',
      'trips','trip_legs','trip_leg_riders','trip_payments'
    ])
  loop
    execute format('drop policy if exists "members_select" on %I', t);
    execute format('drop policy if exists "drivers_insert" on %I', t);
    execute format('drop policy if exists "drivers_update" on %I', t);
    execute format('drop policy if exists "drivers_delete" on %I', t);
  end loop;
end $$;

-- Drop old members policies
drop policy if exists "members_select_self_or_driver" on members;
drop policy if exists "drivers_insert_members"        on members;
drop policy if exists "drivers_update_members"        on members;
drop policy if exists "drivers_delete_members"        on members;

-- Drop old helper functions
drop function if exists public.is_member();
drop function if exists public.is_driver();

-----------------------------------------------------------------------
-- 3. Group-scoped data table policies
-----------------------------------------------------------------------
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'passengers','gas_prices','fillups',
      'trips','trip_legs','trip_leg_riders','trip_payments'
    ])
  loop
    execute format(
      'create policy "group_select" on %I for select to authenticated
       using (public.is_group_member(group_id))', t);
    execute format(
      'create policy "group_insert" on %I for insert to authenticated
       with check (public.is_group_driver(group_id))', t);
    execute format(
      'create policy "group_update" on %I for update to authenticated
       using (public.is_group_driver(group_id))
       with check (public.is_group_driver(group_id))', t);
    execute format(
      'create policy "group_delete" on %I for delete to authenticated
       using (public.is_group_driver(group_id))', t);
  end loop;
end $$;

-----------------------------------------------------------------------
-- 4. Settings: group-scoped, drivers only for writes
-----------------------------------------------------------------------
create policy "group_select" on settings
  for select to authenticated
  using (public.is_group_member(group_id));

create policy "group_update" on settings
  for update to authenticated
  using (public.is_group_driver(group_id))
  with check (public.is_group_driver(group_id));

create policy "group_insert" on settings
  for insert to authenticated
  with check (public.is_group_driver(group_id));

create policy "group_delete" on settings
  for delete to authenticated
  using (public.is_group_driver(group_id));

-----------------------------------------------------------------------
-- 5. Groups policies (use (select auth.uid()) for initplan optimization)
-----------------------------------------------------------------------
create policy "groups_insert" on groups
  for insert to authenticated
  with check (owner_user_id = (select auth.uid()));

create policy "groups_select" on groups
  for select to authenticated
  using (public.is_group_member(id));

create policy "groups_update" on groups
  for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

create policy "groups_delete" on groups
  for delete to authenticated
  using (owner_user_id = (select auth.uid()));

-----------------------------------------------------------------------
-- 6. Members policies
-----------------------------------------------------------------------
create policy "members_select" on members
  for select to authenticated
  using (public.is_group_member(group_id));

create policy "members_insert" on members
  for insert to authenticated
  with check (public.is_group_driver(group_id));

create policy "members_update" on members
  for update to authenticated
  using (public.is_group_driver(group_id))
  with check (public.is_group_driver(group_id));

create policy "members_delete" on members
  for delete to authenticated
  using (public.is_group_driver(group_id));

-----------------------------------------------------------------------
-- 7. Member invites policies
-----------------------------------------------------------------------
create policy "invites_select" on member_invites
  for select to authenticated
  using (public.is_group_member(group_id));

create policy "invites_insert" on member_invites
  for insert to authenticated
  with check (public.is_group_driver(group_id));

create policy "invites_delete" on member_invites
  for delete to authenticated
  using (public.is_group_driver(group_id));

-----------------------------------------------------------------------
-- 8. Profiles policies (use (select auth.uid()) for initplan optimization)
-----------------------------------------------------------------------
create policy "profiles_select_own" on profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "profiles_update_own" on profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "profiles_select_comembers" on profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.members m1
      join public.members m2 on m1.group_id = m2.group_id
      where m1.user_id = (select auth.uid())
        and m2.user_id = profiles.user_id
        and m1.user_id <> m2.user_id
    )
  );

-----------------------------------------------------------------------
-- 9. Cars policies (use (select auth.uid()) for initplan optimization)
-----------------------------------------------------------------------
create policy "cars_select_own" on cars
  for select to authenticated
  using (owner_user_id = (select auth.uid()));

create policy "cars_insert_own" on cars
  for insert to authenticated
  with check (owner_user_id = (select auth.uid()));

create policy "cars_update_own" on cars
  for update to authenticated
  using (owner_user_id = (select auth.uid()))
  with check (owner_user_id = (select auth.uid()));

create policy "cars_delete_own" on cars
  for delete to authenticated
  using (owner_user_id = (select auth.uid()));

create policy "cars_select_shared" on cars
  for select to authenticated
  using (
    exists (
      select 1 from public.trips t
      join public.members m on m.group_id = t.group_id
      where t.car_id = cars.id
        and m.user_id = (select auth.uid())
    )
  );

-----------------------------------------------------------------------
-- 10. Missing FK indexes (advisor performance fix)
-----------------------------------------------------------------------
create index if not exists cars_owner_user_id_idx on cars(owner_user_id);
create index if not exists fillups_car_id_idx on fillups(car_id);
create index if not exists groups_owner_user_id_idx on groups(owner_user_id);
create index if not exists member_invites_invited_by_idx on member_invites(invited_by);
create index if not exists members_user_id_idx on members(user_id);
create index if not exists members_passenger_id_idx on members(passenger_id);
create index if not exists trip_leg_riders_passenger_id_idx on trip_leg_riders(passenger_id);
create index if not exists trips_car_id_idx on trips(car_id);
create index if not exists trips_driver_user_id_idx on trips(driver_user_id);
create index if not exists trips_gas_price_id_idx on trips(gas_price_id);

-----------------------------------------------------------------------
-- 11. Fix mutable search_path on pre-existing function
-----------------------------------------------------------------------
create or replace function public.set_gas_prices_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

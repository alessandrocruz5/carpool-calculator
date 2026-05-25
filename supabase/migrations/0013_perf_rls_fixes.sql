-- Performance fix 1: auth_rls_initplan on push_subscriptions
-- Replace bare auth.uid() with (select auth.uid()) so Postgres evaluates
-- it once per statement rather than once per row.

drop policy if exists "push_select_own" on push_subscriptions;
drop policy if exists "push_insert_own" on push_subscriptions;
drop policy if exists "push_update_own" on push_subscriptions;
drop policy if exists "push_delete_own" on push_subscriptions;

create policy "push_select_own" on push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "push_insert_own" on push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "push_update_own" on push_subscriptions
  for update to authenticated
  using  (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "push_delete_own" on push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Performance fix 2: multiple_permissive_policies on cars
-- Merge cars_select_own + cars_select_shared into a single policy so
-- Postgres only evaluates one policy per SELECT row instead of two.

drop policy if exists "cars_select_own"    on cars;
drop policy if exists "cars_select_shared" on cars;

create policy "cars_select" on cars
  for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    or exists (
      select 1
      from   public.trips   t
      join   public.members m on m.group_id = t.group_id
      where  t.car_id      = cars.id
        and  m.user_id     = (select auth.uid())
    )
  );

-- Performance fix 3: multiple_permissive_policies on profiles
-- Merge profiles_select_own + profiles_select_comembers into one policy.

drop policy if exists "profiles_select_own"       on profiles;
drop policy if exists "profiles_select_comembers" on profiles;

create policy "profiles_select" on profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from   public.members m1
      join   public.members m2 on m1.group_id = m2.group_id
      where  m1.user_id = (select auth.uid())
        and  m2.user_id = profiles.user_id
        and  m1.user_id <> m2.user_id
    )
  );

-- Members table + role-scoped RLS
-- Replaces the wide-open "v1_all" policies from 0001/0002.

create table if not exists members (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  role         text not null check (role in ('driver','passenger')),
  passenger_id uuid references passengers(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table members enable row level security;

-- SECURITY DEFINER helpers so RLS policies stay readable and don't
-- recurse into members' own policies.
create or replace function public.is_member()
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select exists (
    select 1 from public.members where user_id = auth.uid()
  );
$$;

create or replace function public.is_driver()
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select exists (
    select 1 from public.members
    where user_id = auth.uid() and role = 'driver'
  );
$$;

grant execute on function public.is_member()  to authenticated;
grant execute on function public.is_driver()  to authenticated;

-- Drop the permissive v1 policies.
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'passengers','gas_prices','fillups','settings',
      'trips','trip_legs','trip_leg_riders','trip_payments'
    ])
  loop
    execute format('drop policy if exists "v1_all" on %I', t);
  end loop;
end $$;

-- Member-scoped policies on every data table.
do $$
declare t text;
begin
  for t in
    select unnest(array[
      'passengers','gas_prices','fillups','settings',
      'trips','trip_legs','trip_leg_riders','trip_payments'
    ])
  loop
    execute format(
      'create policy "members_select" on %I for select to authenticated using (public.is_member())', t);
    execute format(
      'create policy "drivers_insert" on %I for insert to authenticated with check (public.is_driver())', t);
    execute format(
      'create policy "drivers_update" on %I for update to authenticated using (public.is_driver()) with check (public.is_driver())', t);
    execute format(
      'create policy "drivers_delete" on %I for delete to authenticated using (public.is_driver())', t);
  end loop;
end $$;

-- members table policies: a user can see their own row; drivers manage all.
create policy "members_select_self_or_driver" on members
  for select to authenticated
  using (user_id = auth.uid() or public.is_driver());

create policy "drivers_insert_members" on members
  for insert to authenticated
  with check (public.is_driver());

create policy "drivers_update_members" on members
  for update to authenticated
  using (public.is_driver())
  with check (public.is_driver());

create policy "drivers_delete_members" on members
  for delete to authenticated
  using (public.is_driver());

-- Driver-only RPC: link an existing auth user (by email) to a passenger.
create or replace function public.link_member_by_email(
  p_email        text,
  p_role         text,
  p_passenger_id uuid
) returns members
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_member  members;
begin
  if not public.is_driver() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role not in ('driver','passenger') then
    raise exception 'invalid role %', p_role using errcode = '22023';
  end if;

  select id into v_user_id from auth.users where email = p_email;
  if v_user_id is null then
    raise exception 'no auth user with email %; have them sign in first', p_email
      using errcode = 'P0002';
  end if;

  insert into members (user_id, role, passenger_id)
  values (v_user_id, p_role, p_passenger_id)
  on conflict (user_id) do update
    set role = excluded.role,
        passenger_id = excluded.passenger_id
  returning * into v_member;

  return v_member;
end;
$$;

grant execute on function public.link_member_by_email(text, text, uuid) to authenticated;

-- Bootstrap note: the very first driver row must be inserted manually
-- (e.g. via the SQL editor with the service role) since RLS requires
-- an existing driver to insert new members:
--   insert into members (user_id, role) values ('<auth.users.id>', 'driver');

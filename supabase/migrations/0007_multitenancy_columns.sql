-- Phase 1: Add group_id + car_id columns, restructure members/settings,
-- backfill legacy data, create member_invites.

-----------------------------------------------------------------------
-- 1. Create the "Legacy Carpool" group owned by the first driver
-----------------------------------------------------------------------
do $$
declare
  v_owner uuid;
  v_group uuid;
begin
  -- Pick the first driver as group owner; fall back to any member
  select user_id into v_owner
  from members
  where role = 'driver'
  order by created_at
  limit 1;

  if v_owner is null then
    select user_id into v_owner
    from members
    order by created_at
    limit 1;
  end if;

  -- If there are no members at all, skip the entire data migration
  if v_owner is null then
    return;
  end if;

  insert into groups (id, name, owner_user_id)
  values (gen_random_uuid(), 'Legacy Carpool', v_owner)
  returning id into v_group;

  -- Store the group id for later steps
  perform set_config('legacy.group_id', v_group::text, true);
end $$;

-----------------------------------------------------------------------
-- 2. Add group_id columns (nullable first for backfill)
-----------------------------------------------------------------------
alter table passengers      add column if not exists group_id uuid references groups(id);
alter table gas_prices      add column if not exists group_id uuid references groups(id);
alter table fillups         add column if not exists group_id uuid references groups(id);
alter table trips           add column if not exists group_id uuid references groups(id);
alter table trip_legs       add column if not exists group_id uuid references groups(id);
alter table trip_leg_riders add column if not exists group_id uuid references groups(id);
alter table trip_payments   add column if not exists group_id uuid references groups(id);

-- Add car_id and driver_user_id to trips
alter table trips add column if not exists car_id uuid references cars(id);
alter table trips add column if not exists driver_user_id uuid references auth.users(id);

-- Add car_id to fillups
alter table fillups add column if not exists car_id uuid references cars(id);

-----------------------------------------------------------------------
-- 3. Backfill group_id on all existing rows
-----------------------------------------------------------------------
do $$
declare
  v_group uuid;
begin
  v_group := nullif(current_setting('legacy.group_id', true), '')::uuid;
  if v_group is null then return; end if;

  update passengers      set group_id = v_group where group_id is null;
  update gas_prices      set group_id = v_group where group_id is null;
  update fillups         set group_id = v_group where group_id is null;
  update trips           set group_id = v_group where group_id is null;
  update trip_legs       set group_id = v_group where group_id is null;
  update trip_leg_riders set group_id = v_group where group_id is null;
  update trip_payments   set group_id = v_group where group_id is null;
end $$;

-----------------------------------------------------------------------
-- 4. Restructure members: add group_id, re-key to (group_id, user_id)
-----------------------------------------------------------------------
-- Add group_id column
alter table members add column if not exists group_id uuid references groups(id);

-- Backfill members
do $$
declare
  v_group uuid;
begin
  v_group := nullif(current_setting('legacy.group_id', true), '')::uuid;
  if v_group is null then return; end if;

  update members set group_id = v_group where group_id is null;
end $$;

-- Drop old PK (user_id) and create composite PK
alter table members drop constraint if exists members_pkey;
alter table members alter column group_id set not null;
alter table members add primary key (group_id, user_id);

-- Update role constraint to include 'both'
alter table members drop constraint if exists members_role_check;
alter table members add constraint members_role_check
  check (role in ('driver','passenger','both'));

-----------------------------------------------------------------------
-- 5. Restructure settings: drop singleton, make group_id PK
-----------------------------------------------------------------------
-- Add group_id column
alter table settings add column if not exists group_id uuid references groups(id);

-- Backfill settings
do $$
declare
  v_group uuid;
begin
  v_group := nullif(current_setting('legacy.group_id', true), '')::uuid;
  if v_group is null then return; end if;

  update settings set group_id = v_group where group_id is null;
end $$;

-- Drop the singleton check and old PK, make group_id the PK
alter table settings drop constraint if exists singleton;
alter table settings drop constraint if exists settings_pkey;
alter table settings drop column if exists id;
alter table settings drop column if exists mileage_kml_override;
alter table settings alter column group_id set not null;
alter table settings add primary key (group_id);

-----------------------------------------------------------------------
-- 6. member_invites table
-----------------------------------------------------------------------
create table if not exists member_invites (
  group_id   uuid not null references groups(id) on delete cascade,
  email      text not null,
  role       text not null check (role in ('driver','passenger','both')),
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (group_id, email)
);

alter table member_invites enable row level security;

-----------------------------------------------------------------------
-- 7. Indexes on new group_id columns
-----------------------------------------------------------------------
create index if not exists passengers_group_id_idx      on passengers(group_id);
create index if not exists gas_prices_group_id_idx      on gas_prices(group_id);
create index if not exists fillups_group_id_idx         on fillups(group_id);
create index if not exists trips_group_id_idx           on trips(group_id);
create index if not exists trip_legs_group_id_idx       on trip_legs(group_id);
create index if not exists trip_leg_riders_group_id_idx on trip_leg_riders(group_id);
create index if not exists trip_payments_group_id_idx   on trip_payments(group_id);
create index if not exists members_group_id_idx         on members(group_id);

-- Carpool Calculator initial schema

create extension if not exists "pgcrypto";

create table if not exists passengers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists gas_prices (
  id uuid primary key default gen_random_uuid(),
  effective_date date not null,
  price_per_liter numeric(8,2) not null,
  station_name text not null default 'Petron Commerce Ave, Muntinlupa',
  created_at timestamptz not null default now(),
  unique (effective_date)
);

create table if not exists fillups (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  liters numeric(8,3) not null,
  total_php numeric(10,2) not null,
  odometer_km numeric(10,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  id int primary key default 1,
  mileage_kml_override numeric(6,3),
  round_trip_km numeric(6,2) not null default 42,
  parking_fee_php numeric(8,2) not null default 90,
  toll_skyway_php numeric(8,2) not null default 164,
  toll_slex_php numeric(8,2) not null default 124,
  split_1p_driver int not null default 40,
  split_2p_driver int not null default 25,
  split_3p_driver int not null default 19,
  updated_at timestamptz not null default now(),
  constraint singleton check (id = 1)
);

insert into settings (id) values (1) on conflict (id) do nothing;

create type leg_name as enum ('morning','evening');
create type route_name as enum ('skyway','slex');

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  gas_price_id uuid references gas_prices(id),
  parking_fee_php numeric(8,2) not null default 90,
  notes text,
  created_at timestamptz not null default now(),
  unique (date)
);

create table if not exists trip_legs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  leg leg_name not null,
  route route_name not null,
  unique (trip_id, leg)
);

create table if not exists trip_leg_riders (
  trip_leg_id uuid not null references trip_legs(id) on delete cascade,
  passenger_id uuid not null references passengers(id) on delete restrict,
  primary key (trip_leg_id, passenger_id)
);

create index if not exists trips_date_idx on trips(date);
create index if not exists gas_prices_date_idx on gas_prices(effective_date desc);
create index if not exists fillups_date_idx on fillups(date desc);

-- RLS (off by default for v1 shared-tracker mode; enable when going public)
alter table passengers      enable row level security;
alter table gas_prices      enable row level security;
alter table fillups         enable row level security;
alter table settings        enable row level security;
alter table trips           enable row level security;
alter table trip_legs       enable row level security;
alter table trip_leg_riders enable row level security;

-- Permissive policies for v1 (anon + authenticated full access).
-- Tighten before public release.
do $$
declare t text;
begin
  for t in
    select unnest(array['passengers','gas_prices','fillups','settings','trips','trip_legs','trip_leg_riders'])
  loop
    execute format('drop policy if exists "v1_all" on %I', t);
    execute format('create policy "v1_all" on %I for all using (true) with check (true)', t);
  end loop;
end $$;

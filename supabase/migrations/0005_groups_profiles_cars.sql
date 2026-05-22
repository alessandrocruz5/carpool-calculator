-- Phase 1: New foundation tables for multi-tenant groups

-- groups: each carpool is a group
create table if not exists groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  owner_user_id uuid not null references auth.users(id),
  created_at    timestamptz not null default now()
);

alter table groups enable row level security;

-- profiles: one per auth user, auto-created on sign-up
create table if not exists profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table profiles enable row level security;

-- auto-create a blank profile on auth.users insert
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- cars: per-user vehicles
create table if not exists cars (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null references auth.users(id),
  name                text not null,
  fuel_efficiency_kml numeric(6,3),
  tank_size_liters    numeric(6,2),
  created_at          timestamptz not null default now()
);

alter table cars enable row level security;

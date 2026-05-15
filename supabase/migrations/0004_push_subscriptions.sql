-- Add an updated_at freshness signal to gas_prices so the stale-price
-- cron can tell when the driver last refreshed the price (upserts on
-- effective_date keep created_at frozen).
alter table gas_prices
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_gas_prices_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists gas_prices_set_updated_at on gas_prices;
create trigger gas_prices_set_updated_at
  before update on gas_prices
  for each row execute function public.set_gas_prices_updated_at();

-- Web Push subscriptions, one row per browser/device.
create table if not exists push_subscriptions (
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text primary key,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

create policy "push_select_own" on push_subscriptions
  for select to authenticated
  using (user_id = auth.uid());

create policy "push_insert_own" on push_subscriptions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "push_update_own" on push_subscriptions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "push_delete_own" on push_subscriptions
  for delete to authenticated
  using (user_id = auth.uid());

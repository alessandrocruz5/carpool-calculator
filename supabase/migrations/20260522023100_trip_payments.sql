-- Per-day per-rider payment tracking

create table if not exists trip_payments (
  trip_id uuid not null references trips(id) on delete cascade,
  passenger_id uuid not null references passengers(id) on delete restrict,
  amount_php numeric(8,2) not null,
  paid boolean not null default false,
  paid_at timestamptz,
  primary key (trip_id, passenger_id)
);

create index if not exists trip_payments_passenger_unpaid_idx
  on trip_payments (passenger_id) where paid = false;

alter table trip_payments enable row level security;

drop policy if exists "v1_all" on trip_payments;
create policy "v1_all" on trip_payments for all using (true) with check (true);

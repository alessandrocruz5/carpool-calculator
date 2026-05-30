-- Passenger-facing trip dispute / correction flow.
-- A dispute is filed by a passenger against a trip; drivers in the trip's
-- group can resolve (accept) or dismiss it. Closed disputes keep a record
-- with resolved_at for audit.

create type trip_dispute_status as enum ('open', 'resolved', 'dismissed');

create table if not exists trip_disputes (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references groups(id) on delete cascade,
  trip_id           uuid not null references trips(id)  on delete cascade,
  reporter_user_id  uuid not null references auth.users(id) on delete cascade,
  reason            text not null,
  status            trip_dispute_status not null default 'open',
  resolution_note   text,
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  resolved_by       uuid references auth.users(id) on delete set null
);

create index trip_disputes_group_status_idx
  on trip_disputes (group_id, status, created_at desc);
create index trip_disputes_trip_idx
  on trip_disputes (trip_id);
create index trip_disputes_reporter_idx
  on trip_disputes (reporter_user_id, created_at desc);

alter table trip_disputes enable row level security;

-- Members of the group can see disputes (drivers act on them; passengers
-- track their own filings via the group scope).
create policy "trip_disputes_select" on trip_disputes
  for select to authenticated
  using (public.is_group_member(group_id));

-- Any group member can file a dispute, but only as themselves.
create policy "trip_disputes_insert" on trip_disputes
  for insert to authenticated
  with check (
    public.is_group_member(group_id)
    and reporter_user_id = (select auth.uid())
    and status = 'open'
  );

-- Only drivers can resolve/dismiss.
create policy "trip_disputes_update_driver" on trip_disputes
  for update to authenticated
  using (public.is_group_driver(group_id))
  with check (public.is_group_driver(group_id));

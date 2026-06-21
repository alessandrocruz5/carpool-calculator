-- SABAY-33 — Payment confirmation: schema + RLS
--
-- Adds the passenger "I paid" claim to trip_payments and lets a passenger set
-- that claim on *their own* payment row only — without being able to flip
-- `paid` (the driver-only confirmation). Also re-asserts that trip_payments is
-- group-scoped under RLS: the original 0002 `v1_all using(true)` policy was
-- dropped in 0003 and replaced by group-scoped policies in 0007; we defensively
-- drop any lingering copy so the wide-open policy can never resurface.
--
-- Forward-only. No backfill — existing rows get claimed_at = null.

-----------------------------------------------------------------------
-- 1. Schema: nullable claim timestamp
-----------------------------------------------------------------------
-- passenger_id already identifies the claimant (one row per passenger per
-- trip), so no separate claimed_by column is needed.
alter table trip_payments
  add column if not exists claimed_at timestamptz;

-- Supports the SABAY-34 expiry sweep: unconfirmed claims awaiting the driver.
create index if not exists trip_payments_pending_claim_idx
  on trip_payments (group_id, claimed_at)
  where paid = false and claimed_at is not null;

-----------------------------------------------------------------------
-- 2. Defensively ensure the wide-open policy is gone
-----------------------------------------------------------------------
drop policy if exists "v1_all" on trip_payments;

-----------------------------------------------------------------------
-- 3. Helper: is the given passenger row the caller's own?
-----------------------------------------------------------------------
-- SECURITY DEFINER (like is_group_member / is_group_driver) to avoid recursing
-- into members' own RLS.
create or replace function public.is_own_passenger(gid uuid, pid uuid)
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
      and passenger_id = pid
  );
$$;

revoke execute on function public.is_own_passenger(uuid, uuid) from public;
grant  execute on function public.is_own_passenger(uuid, uuid) to authenticated;

-----------------------------------------------------------------------
-- 4. RLS: a passenger may UPDATE their own payment row
-----------------------------------------------------------------------
-- The existing driver-only `group_update` policy stays (drivers retain full
-- edit incl. confirm). This adds an OR-branch so a passenger can update their
-- own row; the trigger in step 5 restricts *which columns* they may change.
drop policy if exists "claim_own_update" on trip_payments;
create policy "claim_own_update" on trip_payments
  for update to authenticated
  using (public.is_own_passenger(group_id, passenger_id))
  with check (public.is_own_passenger(group_id, passenger_id));

-----------------------------------------------------------------------
-- 5. Column guard: non-drivers may only touch claimed_at
-----------------------------------------------------------------------
-- RLS is row-level only; it cannot stop a self-updating passenger from also
-- flipping `paid`. This BEFORE UPDATE trigger enforces column-level intent:
--   * drivers (is_group_driver / 'both') may change anything → confirm intact
--   * everyone else may change ONLY claimed_at; any change to paid / paid_at /
--     amount_php / identity columns is rejected.
-- Safe for existing writers: the only UPDATE paths are the driver-gated
-- payments PATCH and the driver-gated trips upsert (both pass is_group_driver);
-- the backfill script INSERTs, so BEFORE UPDATE never fires for it.
create or replace function public.trip_payments_claim_guard()
returns trigger
language plpgsql
set search_path = public, auth
as $$
begin
  if public.is_group_driver(new.group_id) then
    return new;
  end if;

  if new.trip_id        is distinct from old.trip_id
     or new.passenger_id is distinct from old.passenger_id
     or new.group_id     is distinct from old.group_id
     or new.amount_php   is distinct from old.amount_php
     or new.paid         is distinct from old.paid
     or new.paid_at      is distinct from old.paid_at
  then
    raise exception
      'passengers may only set claimed_at on their own payment'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trip_payments_claim_guard on trip_payments;
create trigger trip_payments_claim_guard
  before update on trip_payments
  for each row execute function public.trip_payments_claim_guard();

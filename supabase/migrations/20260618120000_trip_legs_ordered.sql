-- SABAY-23 — Ordered N-leg storage on trip_legs.
-- Generalizes trip_legs from the fixed two-value enum (morning/evening) to an
-- ordered list of N legs via a new `position` column. Forward-only: existing
-- 2-leg trips are backfilled morning→0 / evening→1. `leg` becomes nullable so
-- legs beyond the morning/evening enum can exist (leg null, position >= 2), and
-- the (trip_id, leg) uniqueness is dropped since a trip now holds N ordered legs.
-- Distance + rider constraints are left untouched. No money backfill — legacy
-- 2-leg trips compute identically.
--
-- `position` stays NULLABLE here on purpose; SABAY-25 enforces NOT NULL + ordered
-- uniqueness in a follow-up migration once the data layer writes it for all rows.

alter table trip_legs add column if not exists position smallint;

-- Backfill ordering for existing rows from the legacy enum.
update trip_legs set position = 0 where leg = 'morning' and position is null;
update trip_legs set position = 1 where leg = 'evening' and position is null;

-- Drop the fixed two-leg uniqueness so a trip can hold N ordered legs.
alter table trip_legs drop constraint if exists trip_legs_trip_id_leg_key;

-- Allow legs beyond the morning/evening enum (leg null, ordered by position).
alter table trip_legs alter column leg drop not null;

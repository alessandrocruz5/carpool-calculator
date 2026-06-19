-- SABAY-25 — Enforce ordered N-leg storage on trip_legs.
-- Follow-up to SABAY-23 (which added a NULLABLE `position`): now that the data
-- layer writes `position` for every leg, backfill any stragglers, then enforce
-- NOT NULL + per-trip ordered uniqueness. Forward-only. No money backfill —
-- legacy trips' positions (morning→0, evening→1) are already correct.

-- Backfill the legacy enum rows first (idempotent with SABAY-23's backfill).
update trip_legs set position = 0 where position is null and leg = 'morning';
update trip_legs set position = 1 where position is null and leg = 'evening';

-- Any remaining NULL positions (unnamed legs written before this migration, or
-- enum rows that somehow missed the backfill): assign sequential positions per
-- trip after that trip's current max, deterministically ordered by ctid.
with ranked as (
  select
    t1.ctid as row_ctid,
    coalesce(
      (select max(t2.position) from trip_legs t2 where t2.trip_id = t1.trip_id),
      -1
    ) + row_number() over (partition by t1.trip_id order by t1.ctid) as new_pos
  from trip_legs t1
  where t1.position is null
)
update trip_legs set position = ranked.new_pos
from ranked
where trip_legs.ctid = ranked.row_ctid;

-- Enforce going forward: every leg is ordered, and a trip cannot reuse a position.
alter table trip_legs alter column position set not null;

alter table trip_legs drop constraint if exists trip_legs_trip_id_position_key;
alter table trip_legs add constraint trip_legs_trip_id_position_key unique (trip_id, position);

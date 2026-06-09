-- Performance v2 — indexes identified by EXPLAIN ANALYZE on the seeded
-- volume profile (2 groups × 500 trips × 6 months; 200 fillups × 2 cars).
-- See docs/ops/perf-baseline.md for baseline timings.
--
-- Findings:
--
-- 1. Rolling-mileage query joins fillups → cars → trips (for distance-by-
--    driver). Sort on fillups.date dominated. Already indexed on date
--    alone, but the rollup is scoped per car: composite (car_id, date) is
--    a clean win.
--
-- 2. Week-view query: trips filtered by (group_id, date BETWEEN ...) with
--    archived_at IS NULL. 0015 already adds a partial index covering this;
--    no further work here.
--
-- 3. trip_payments week-view join: payments by group + trip_id with a
--    paid/unpaid filter. Seq scan on trip_payments showed up for one
--    group's payments page. Add (group_id, paid) partial index for the
--    "unpaid only" filter, plus (trip_id) is already covered by FK.
--
-- 4. trip_legs lookup by trip_id is fine via the unique (trip_id, leg),
--    but trip_leg_riders by trip_leg_id was doing an index-only on the
--    composite PK — leaves the (passenger_id) reverse lookup as a seq
--    scan. Add reverse index.
--
-- 5. audit_log queries by (group_id, table_name) for the admin page.
--    Composite covering that filter.

create index if not exists fillups_car_date_idx
  on fillups (car_id, date desc);

create index if not exists trip_payments_group_unpaid_idx
  on trip_payments (group_id, trip_id)
  where paid = false;

create index if not exists trip_leg_riders_passenger_idx
  on trip_leg_riders (passenger_id);

create index if not exists audit_log_group_table_idx
  on audit_log (group_id, table_name, created_at desc);

-- ANALYZE so the planner picks up the new indexes immediately.
analyze fillups;
analyze trip_payments;
analyze trip_leg_riders;
analyze audit_log;

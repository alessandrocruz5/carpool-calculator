# Index drop plan — Sprint 3

**Date:** 2026-05-29
**Project:** `vcmarwmweysxqhhgdcwc` (sabay)
**Source:** `docs/audit/index-usage.json` (live `pg_stat_user_indexes` + `pg_constraint`)

## What changed since Sprint 2

Sprint 2 declined to drop any "unused" index because the DB had **no query
traffic**, so `idx_scan = 0` meant "never queried yet," not "redundant."

That is **no longer true.** The live stats now show real traffic — many indexes
have meaningful scan counts (`members_user_id_idx` 108, `groups_pkey` 149,
`trip_leg_riders_pkey` 451, `fillups_group_id_idx` 72, etc.). So a `idx_scan = 0`
today is a real signal, *but* it still has to be weighed against the **structural**
role of the index (FK coverage, constraint enforcement), which usage stats don't
capture.

## Decision rule (conservative)

- `idx_scan > 0` → **KEEP** (it is being used).
- Backs a PRIMARY KEY / UNIQUE constraint → **KEEP** (cannot drop without dropping the constraint).
- Single-column **FK-covering** index, even at `idx_scan = 0` → **KEEP**. Dropping it
  re-introduces the `unindexed_foreign_keys` advisor finding and forces sequential
  scans on cascade deletes (`ON DELETE CASCADE`), `RESTRICT` checks, `SET NULL`
  updates of the parent row, and any join/filter on the FK column. The planner not
  having *chosen* it yet on a tiny table does not make the FK cover unnecessary.
- **DROP** only where the index is genuinely redundant: `idx_scan = 0`, does **not**
  back a constraint, and its FK-coverage role (if any) is **already filled by a
  different index that is in active use**.
- Anything ambiguous → **DEFER**.

## The 16 "unused" indexes from the audit

| # | Table | Index | Definition | idx_scan | Backs FK/UNIQUE? | Size | Decision | Why |
|---|-------|-------|-----------|:--------:|------------------|------|----------|-----|
| 1 | trips | `trips_group_date_idx` | `(group_id, date)` | **0** | No constraint. group_id FK already covered by `trips_group_id_idx` (7 scans) | 16 kB | **DROP** | Redundant composite. The `group_id` FK cover is provided by the in-use `trips_group_id_idx`; the `(group_id, date)` ordering has never been chosen by the planner. |
| 2 | members | `members_user_group_idx` | `(user_id, group_id)` | **0** | No constraint (not UNIQUE). user_id FK already covered by `members_user_id_idx` (108 scans) | 16 kB | **DROP** | Redundant composite. No unique constraint on the pair; the `user_id` FK cover is provided by the heavily-used `members_user_id_idx`, and `members_group_id_idx` covers `group_id`. The pair index is never used. |
| 3 | trip_payments | `trip_payments_passenger_unpaid_idx` | `(passenger_id) WHERE paid = false` | **0** | Partial — does **not** reliably back the `passenger_id` FK | 16 kB | **DEFER** | Feature index for "unpaid payments by passenger." Never used yet, but it's a deliberate partial index, not an auto-added FK cover. A *partial* index cannot satisfy the `ON DELETE RESTRICT` check on `trip_payments_passenger_id_fkey`, so dropping it may surface a real unindexed-FK gap (the FK would then need a full `(passenger_id)` index instead). Revisit after the unpaid-payments path sees traffic; decide whether to drop or replace with a full index. |
| 4 | trip_legs | `trip_legs_group_id_idx` | `(group_id)` | 0 | FK `trip_legs_group_id_fkey` → groups | 16 kB | **KEEP** | Sole cover for the `group_id` FK. |
| 5 | trip_leg_riders | `trip_leg_riders_group_id_idx` | `(group_id)` | 0 | FK `trip_leg_riders_group_id_fkey` → groups | 16 kB | **KEEP** | Sole cover for the `group_id` FK. |
| 6 | trip_leg_riders | `trip_leg_riders_passenger_id_idx` | `(passenger_id)` | 0 | FK `trip_leg_riders_passenger_id_fkey` → passengers `ON DELETE RESTRICT` | 16 kB | **KEEP** | Sole cover; RESTRICT delete checks would seq-scan without it. |
| 7 | members | `members_group_id_idx` | `(group_id)` | 0 | FK `members_group_id_fkey` → groups | 16 kB | **KEEP** | Sole cover for the `group_id` FK. |
| 8 | members | `members_passenger_id_idx` | `(passenger_id)` | 0 | FK `members_passenger_id_fkey` → passengers `ON DELETE SET NULL` | 16 kB | **KEEP** | Sole cover; SET NULL on parent delete would seq-scan without it. |
| 9 | groups | `groups_owner_user_id_idx` | `(owner_user_id)` | 0 | FK `groups_owner_user_id_fkey` → auth.users | 16 kB | **KEEP** | Sole cover for the `owner_user_id` FK. |
| 10 | trips | `trips_gas_price_id_idx` | `(gas_price_id)` | 0 | FK `trips_gas_price_id_fkey` → gas_prices | 16 kB | **KEEP** | Sole cover for the `gas_price_id` FK. |
| 11 | trips | `trips_driver_user_id_idx` | `(driver_user_id)` | 0 | FK `trips_driver_user_id_fkey` → auth.users | 16 kB | **KEEP** | Sole cover for the `driver_user_id` FK. |
| 12 | trips | `trips_car_id_idx` | `(car_id)` | 0 | FK `trips_car_id_fkey` → cars | 16 kB | **KEEP** | Sole cover for the `car_id` FK. |
| 13 | member_invites | `member_invites_invited_by_idx` | `(invited_by)` | 0 | FK `member_invites_invited_by_fkey` → auth.users | 16 kB | **KEEP** | Sole cover for the `invited_by` FK. |
| 14 | fillups | `fillups_car_id_idx` | `(car_id)` | 0 | FK `fillups_car_id_fkey` → cars | 16 kB | **KEEP** | Sole cover for the `car_id` FK. |
| 15 | fillups | `fillups_owner_user_id_idx` | `(owner_user_id)` | 0 | FK `fillups_owner_user_id_fkey` → auth.users | 16 kB | **KEEP** | Sole cover for the `owner_user_id` FK. |
| 16 | push_subscriptions | `push_subscriptions_user_id_idx` | `(user_id)` | 0 | FK `push_subscriptions_user_id_fkey` → auth.users `ON DELETE CASCADE` | 8 kB | **KEEP** | Sole cover; user-delete cascade would seq-scan without it. |

> The 4 zero-scan indexes on `trip_disputes` (`group_status`, `trip`, `reporter`,
> `resolved_by`) are **out of scope** for this plan and all **KEEP**: the table was
> added in `0017` and `resolved_by` was indexed in `0019` specifically to clear an
> `unindexed_foreign_keys` finding. They are brand-new FK covers with no traffic
> window yet — exactly the Sprint-2 situation.

## Summary

| Decision | Count | Indexes |
|----------|:-----:|---------|
| **DROP** | 2 | `trips_group_date_idx`, `members_user_group_idx` |
| **DEFER** | 1 | `trip_payments_passenger_unpaid_idx` |
| **KEEP** | 13 | all single-column FK-covering indexes listed above |

**Net:** drop 2 redundant composite indexes. This introduces **zero** new
`unindexed_foreign_keys` findings — both dropped indexes have their FK-coverage
role already served by a different, actively-used index (`trips_group_id_idx`,
`members_user_id_idx`). Migration `0020` implements exactly these two drops.

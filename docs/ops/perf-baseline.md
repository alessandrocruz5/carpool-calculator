# Performance baseline

Captured against a dev branch seeded with realistic volume:

- 2 groups
- 5 users per group (10 total)
- 2 cars per driver (4 cars per group)
- 500 trips per group across 6 months (1,000 trips total)
- 200 fillups per car (800 fillups total)
- Derived: ~3,000 trip_legs, ~6,000 trip_leg_riders, ~4,000 trip_payments

Seed script: `scripts/seed-perf.ts`. Re-run before each perf review so
numbers stay comparable.

## How baselines were captured

```bash
# Connect to the perf dev branch
psql "$PERF_BRANCH_URL"
```

```sql
explain (analyze, buffers, format text)
select  ...;  -- queries below
```

Each query was run 5 times; we report the median of the last 3 (first 2
warm the cache). Timings are post-0016_perf_v2.

## Queries and timings

### Q1. Rolling mileage per driver, last 6 months

```sql
select  c.owner_user_id,
        sum(t.distance_km) as km,
        sum(f.liters)      as liters
from    fillups f
join    cars     c on c.id = f.car_id
join    trips    t on t.car_id = c.id
                  and t.date  >= current_date - 180
                  and t.archived_at is null
where   c.group_id = $1
group by c.owner_user_id;
```

| Version              | Median | Plan summary                                                                 |
| -------------------- | ------ | ---------------------------------------------------------------------------- |
| Pre-0016             | 184 ms | Seq scan on `fillups` (8 k rows); sort by `date` before merge join.          |
| Post-0016            | **38 ms** | Index scan via `fillups_car_date_idx`; nested loop, no sort.              |

### Q2. Week view (trips + payments)

```sql
select  t.id, t.date, t.parking_fee_php, t.notes,
        p.passenger_id, p.amount_php, p.paid
from    trips        t
left join trip_payments p on p.trip_id = t.id
where   t.group_id    = $1
  and   t.date between $2 and $3
  and   t.archived_at is null;
```

| Version              | Median | Plan summary                                                                  |
| -------------------- | ------ | ----------------------------------------------------------------------------- |
| Pre-0015 (no partial)| 71 ms  | Index scan on `trips_date_idx`, then filter by group + archived_at.           |
| Post-0015            | **9 ms**  | Index scan on `trips_active_group_date_idx` (partial), exact-match lookup.|

### Q3. Unpaid payments view

```sql
select  p.trip_id, p.passenger_id, p.amount_php,
        t.date
from    trip_payments p
join    trips         t on t.id = p.trip_id and t.archived_at is null
where   p.group_id = $1
  and   p.paid     = false
order by t.date desc;
```

| Version              | Median | Plan summary                                                                |
| -------------------- | ------ | --------------------------------------------------------------------------- |
| Pre-0016             | 96 ms  | Seq scan on `trip_payments`; filter `paid = false` after fetch.             |
| Post-0016            | **14 ms** | Index scan on partial `trip_payments_group_unpaid_idx`.                  |

### Q4. Audit log page

```sql
select  *
from    audit_log
where   group_id = $1
  and   table_name = any($2)
order by created_at desc
limit   100;
```

| Version              | Median | Plan summary                                                                |
| -------------------- | ------ | --------------------------------------------------------------------------- |
| Post-0014 only       | 23 ms  | Index scan on `audit_log_group_created_idx`, filter on table_name.          |
| Post-0016            | **6 ms**  | Index scan on `audit_log_group_table_idx`.                               |

## Seq scans / sorts > 1k rows

After 0016, none of the four hot queries does a seq scan or sort over
>1k rows. The largest remaining sort is the audit-page sort (LIMIT 100,
all in-index).

## Regression detection

Run `npm run perf:baseline` against the perf dev branch. The script
re-executes Q1–Q4, parses `EXPLAIN ANALYZE` output, and fails CI if any
median exceeds the post-0016 timing here by more than 50% (i.e. Q1 > 57
ms, Q2 > 13 ms, Q3 > 21 ms, Q4 > 9 ms). Tolerances are intentionally
loose so dev-branch noise doesn't flap CI.

When a regression fires, the action is: add an EXPLAIN ANALYZE to the
PR and either (a) justify the new cost or (b) ship a follow-up index.

## Re-baselining

Re-capture this file when:

- Schema changes touch any of the four queried tables.
- Volume grows by 5×.
- We change Postgres version (Supabase Pg upgrades).

Last captured: 2026-05-27, Postgres 15, Supabase Pro tier.

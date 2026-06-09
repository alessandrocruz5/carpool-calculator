# Sprint 3 — Unused Index Drop Results

**Date:** 2026-05-29
**Migration applied:** `0020_drop_unused_indexes.sql`
**Project:** `vcmarwmweysxqhhgdcwc` (sabay)
**Inputs:** `docs/audit/index-usage.json`, `docs/audit/index-drop-plan.md`

## Summary

Confirmed the "unused index" claims against **live usage statistics** (the DB now
has real query traffic, unlike Sprint 2). Of the 16 zero-scan indexes on the named
tables, only **2 redundant composite indexes** were safe to drop; the other 13 are
single-column FK covers (kept) and 1 is a partial feature index (deferred).

| Decision | Count | Indexes |
|----------|:-----:|---------|
| **DROP** | 2 | `trips_group_date_idx`, `members_user_group_idx` |
| **DEFER** | 1 | `trip_payments_passenger_unpaid_idx` |
| **KEEP** | 13 | all single-column FK-covering indexes |

Both dropped indexes had their FK-coverage role already served by a different,
actively-used index (`trips_group_id_idx` 7 scans, `members_user_id_idx` 108
scans), so **no `unindexed_foreign_keys` finding was introduced**.

## 1. Apply

`DROP INDEX CONCURRENTLY` cannot run inside a transaction block, and the MCP
`apply_migration` path wraps each migration in one. The two statements were
therefore applied via `execute_sql` (which runs them in autocommit), exactly as
written in `0020_drop_unused_indexes.sql`:

```sql
drop index concurrently if exists public.trips_group_date_idx;   -- OK
drop index concurrently if exists public.members_user_group_idx; -- OK
```

Post-apply verification — both gone:

```sql
SELECT indexname FROM pg_indexes
WHERE schemaname='public'
  AND indexname IN ('trips_group_date_idx','members_user_group_idx');
-- (0 rows)
```

The migration was recorded in `supabase_migrations.schema_migrations`
(version `20260529153000`, name `drop_unused_indexes`) so `list_migrations`
stays in sync with the repo.

## 2. perf-probe

`scripts/perf-probe.ts` requires `NEXT_PUBLIC_SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` and a real `<group_id> <user_id>`. As in Sprint 2,
**this remote environment has no `.env.local`/service-role key**, so the probe
was not run here, and no prior `perf-baseline.json` exists to diff against.

It is also not informative for this change: the probe reads `trips`, `fillups`,
and `push_subscriptions`. The only dropped index that touches a probed table is
`trips_group_date_idx`, and the probe's `trips` query is
`SELECT * FROM trips WHERE group_id = $1 LIMIT 50` — served by the **retained**
`trips_group_id_idx`, not the dropped composite. No probe regression is expected.

To capture timings, run locally against a dev/preview branch:

```bash
npx tsx scripts/perf-probe.ts <group_id> <user_id>
```

## 3. Advisor diff — Sprint 2 → Sprint 3

Files compared:
- `docs/audit/post-sprint2-perf-advisors.json`
- `docs/audit/post-sprint3-perf-advisors.json`

| Lint | Level | post-sprint2 | post-sprint3 | Δ |
|------|-------|:------------:|:------------:|:-:|
| `unused_index` | INFO | 20 | **18** | **−2** |
| `unindexed_foreign_keys` | INFO | 0 | **0** | — (no regression) |
| `auth_rls_initplan` | WARN | 0 | 0 | — |
| `multiple_permissive_policies` | WARN | 0 | 0 | — |

The two cleared `unused_index` entries are exactly the dropped indexes
(`trips_group_date_idx`, `members_user_group_idx`). The remaining 18 are the 13
retained FK covers + the 1 deferred partial index + 4 brand-new `trip_disputes`
indexes (out of scope; no traffic window yet).

## 4. Follow-up reminder

> **2026-06-05 (Sprint 3 + 1 week): re-check `pg_stat_user_indexes`** to confirm
> no slow queries are now scanning sequentially after the drops, and to gather a
> wider usage window for the KEEP/DEFER set.
>
> Run:
> ```sql
> SELECT schemaname, relname AS table, indexrelname AS index,
>        idx_scan, idx_tup_read,
>        pg_size_pretty(pg_relation_size(indexrelid)) AS size
> FROM pg_stat_user_indexes
> WHERE schemaname='public'
> ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;
> ```
> Also re-run `get_advisors type="performance"` and check for any new
> `unindexed_foreign_keys` or sequential-scan-heavy tables (`pg_stat_user_tables`
> `seq_scan` vs `idx_scan`). Specifically decide on
> `trip_payments_passenger_unpaid_idx`: if the unpaid-payments feature path has
> seen traffic and the index is still unused, drop it — but note its FK
> (`trip_payments_passenger_id_fkey`, `ON DELETE RESTRICT`) would then need a
> **full** `(passenger_id)` index, since the partial one can't serve the RESTRICT
> check.

## Conclusion

- Dropped **2** genuinely redundant composite indexes, confirmed unused against
  live stats.
- **No** `unindexed_foreign_keys` regression — both FK columns remain covered by
  in-use indexes.
- 13 FK-covering indexes retained; 1 partial index deferred with a clear decision
  rule for next week.
- `unused_index` advisor count: **20 → 18**.

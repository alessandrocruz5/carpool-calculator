# Sprint 2 — RLS / Performance Advisor Results

**Date:** 2026-05-29
**Migration applied:** `0019_perf_advisor_fixes.sql`
**Project:** `vcmarwmweysxqhhgdcwc` (sabay)

## Summary

Sprint 2 was originally scoped to fix two classes of RLS performance problem —
bare `auth.uid()` calls and duplicate PERMISSIVE policies. **Both were already
remediated** before this sprint (see `rls-analysis.md`), so there was no RLS
rewrite to do. The sprint instead addressed the one genuine, actionable lint the
performance advisor reports: an **unindexed foreign key** on
`trip_disputes.resolved_by`.

## Part 1 — The planned RLS fixes were already done

The Task 2.2 brief assumed the live database still had:

- bare `auth.uid()` in `push_subscriptions` policies,
- split `cars_select_own` + `cars_select_shared` policies to merge,
- split `profiles_select_own` + `profiles_select_comembers` policies to merge.

Verified against the live DB (`pg_policies`) — none of this is true:

| Brief assumption | Live state | Action |
|------------------|-----------|--------|
| `push_subscriptions` bare `auth.uid()` | All 4 policies (`push_select_own`/`insert`/`update`/`delete_own`) already use `(SELECT auth.uid())`; one per command, no duplicates | none needed |
| `cars_select_own` + `cars_select_shared` | Don't exist — already a single merged `cars_select` that ORs owner + shared `EXISTS` | none needed |
| `profiles_select_own` + `profiles_select_comembers` | Don't exist — already a single merged `profiles_select` | none needed |
| Other tables w/ bare `auth.uid()` | None — every reference is wrapped | none needed |

A no-op DROP/CREATE migration was therefore **not written** — and the literal
brief would have failed outright (it DROPs policy names that don't exist).

## Part 2 — What `0019` actually does

Added a covering btree index on the previously-unindexed foreign key:

```sql
create index if not exists trip_disputes_resolved_by_idx
  on trip_disputes (resolved_by);
```

`trip_disputes.resolved_by` → `auth.users` (FK `trip_disputes_resolved_by_fkey`)
had no covering index. Without one, any update/delete of a referenced user, and
any "disputes I resolved" filter/join, forces a sequential scan of
`trip_disputes`. Index confirmed `indisvalid = true` after apply.

## Advisor diff (baseline → post)

Files compared:
- `docs/audit/baseline-perf-advisors.json`
- `docs/audit/post-sprint2-perf-advisors.json`

| Lint | Level | baseline | post | Δ |
|------|-------|----------|------|---|
| `auth_rls_initplan` ("Auth RLS Initialization Plan") | WARN | **0** | **0** | — (already clear before sprint) |
| `multiple_permissive_policies` ("Multiple Permissive Policies") | WARN | **0** | **0** | — (already clear before sprint) |
| `unindexed_foreign_keys` (`trip_disputes.resolved_by`) | INFO* | 1 | **0** | **−1 (cleared)** |
| `unused_index` | INFO | 19 | 20 | +1 (the new index itself; see below) |

\* Supabase reports `unindexed_foreign_keys` at INFO level, but it is the only
structural (non-"no-traffic-yet") performance finding on this DB.

**Headline:** the two warning classes this sprint targeted —
*Auth RLS Initialization Plan* and *Multiple Permissive Policies* — both stand
at **0** (they were already cleared by `0013_perf_rls_fixes` and earlier work,
and remain clear). The unindexed-FK finding is now resolved.

### Why the `unused_index` count went *up*, not down

The brief offered dropping the "unused" indexes as an option. We deliberately
**did not**, because it would be a net regression:

- 18 of the 19 baseline `unused_index` entries are **foreign-key covering
  indexes** (added in `0011_perf_indexes` / `0016_perf_v2` precisely to satisfy
  the `unindexed_foreign_keys` linter). Dropping them would immediately
  re-introduce `unindexed_foreign_keys` warnings and slow cascade deletes/joins.
- This project is ~1 week old (created 2026-05-22) with no production query
  traffic, so the planner has **no usage statistics**. "Unused" here means
  "never queried yet," not "redundant." The `unused_index` linter is a known
  false-positive in this situation.
- The newly added `trip_disputes_resolved_by_idx` shows up as `unused` for the
  same reason (brand new, no traffic) — hence the count of 20.

Recommendation: re-evaluate `unused_index` only after a meaningful production
usage window (the linter reads `pg_stat_user_indexes`).

## Perf-probe timings

`scripts/perf-probe.ts` requires `NEXT_PUBLIC_SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` and a real `<group_id> <user_id>`, and writes to
`docs/audit/perf-baseline.json`. **It was not run for this sprint:** this
remote environment has no `.env.local`/service-role key, and no prior
`perf-baseline.json` exists to diff against. Re-running it is also not
informative here — `0019` only adds an index to `trip_disputes`, a table the
probe does not query (the probe covers `trips`, `fillups`, and
`push_subscriptions`). To capture timings, run locally against a dev/preview
branch:

```
npx tsx scripts/perf-probe.ts <group_id> <user_id>
```

## Smoke test (push_subscriptions / cars / profiles)

The Task 2.3 smoke test was meant to confirm RLS policies still return the same
rows after a policy change. **This migration changes no policies** — only adds
an index — so per-user row visibility is unchanged by construction. As a
sanity check that nothing broke, all three tables (plus the changed
`trip_disputes`) remain queryable post-migration:

| Table | Total rows (service-role) |
|-------|---------------------------|
| `push_subscriptions` | 0 |
| `cars` | 1 |
| `profiles` | 6 |
| `trip_disputes` | 0 |

No errors; RLS policy definitions for these tables are byte-for-byte unchanged
from `rls-policies-before.json`.

## Conclusion

- The targeted RLS warning classes (Auth RLS Initialization Plan, Multiple
  Permissive Policies) are at **0** and remain so.
- The one real structural perf finding — the unindexed `trip_disputes.resolved_by`
  FK — is **resolved** by `0019`.
- "Unused" indexes were intentionally retained (FK-covering, no traffic
  baseline); dropping them would have been a regression.

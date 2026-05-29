# Audit Remediation — Final Report

**Date:** 2026-05-29
**Project:** `vcmarwmweysxqhhgdcwc` (sabay / carpool-calculator)
**Baseline snapshot:** 2026-05-28 — latest migration `20260525072641_0013_perf_rls_fixes`
**Final snapshot:** 2026-05-29 — latest migration `20260529153000_drop_unused_indexes`

Source artifacts:

- Baseline: `baseline-perf-advisors.json`, `baseline-security-advisors.json`,
  `baseline-migrations.json`, `baseline-summary.md`
- Final: `final-advisors.json` (live `get_advisors` performance + security),
  `perf-final.json` (probe status)
- Per-sprint: `sprint1-results.md`, `sprint2-results.md`, `sprint3-results.md`

---

## 1. Performance advisor warnings (by category)

All performance findings are **INFO** level — there are **no WARN/ERROR**
performance lints at baseline or final.

| Lint (category) | Level | Baseline | Final | Δ |
|---|---|:---:|:---:|:---:|
| `unused_index` | INFO | 19 | **18** | **−1** |
| `unindexed_foreign_keys` | INFO | 1 | **0** | **−1 (cleared)** |
| `auth_rls_initplan` (Auth RLS Init Plan) | WARN | 0 | 0 | — |
| `multiple_permissive_policies` | WARN | 0 | 0 | — |
| **Total performance findings** | | **20** | **18** | **−2** |

Notes:

- The targeted RLS warning classes (`auth_rls_initplan`,
  `multiple_permissive_policies`) were already at **0** at baseline — converted
  to `(SELECT auth.uid())` form and merged into single permissive policies by
  `0013_perf_rls_fixes` and earlier work — and remain at **0**. See
  `rls-analysis.md` / `sprint2-results.md`.
- `unindexed_foreign_keys` (`trip_disputes.resolved_by`) was the one real
  structural finding; **resolved** by `0019` (added a covering index).
- Net `unused_index` math across the audit: 19 baseline → +1 (the new
  `trip_disputes_resolved_by_idx` from `0019`) = 20 → −2 (composite indexes
  dropped in `0020`) = 18.

The remaining 18 `unused_index` entries are all INFO false-positives for a
~1-week-old DB with thin query-stats: 13 single-column FK-covering indexes
(kept on purpose), 1 deferred partial index, and 4 brand-new `trip_disputes`
indexes with no traffic window yet. See §4.

## 2. Security advisor warnings

| Lint | Level | Baseline | Final | Δ |
|---|---|:---:|:---:|:---:|
| `authenticated_security_definer_function_executable` | WARN | 6 | 6 | — |
| `auth_leaked_password_protection` | WARN | 1 | 1 | — |
| **Total security findings** | | **7** | **7** | — |

The headcount is unchanged **by design**, not because nothing improved:

- The 6 `SECURITY DEFINER` functions (`claim_member_invite`, `create_group`,
  `rename_group`, `link_member_by_email`, `is_group_member`, `is_group_driver`)
  *intentionally* keep their `authenticated` EXECUTE grant — signed-in users
  call them from the app, with authorization enforced inside each function body
  / API route. The advisor flags any `authenticated`-executable `SECURITY
  DEFINER` function, so it correctly keeps reporting them. These are **accepted
  warnings**, not regressions.
- The real Sprint 1 win — revoking the implicit **`PUBLIC`/`anon`** EXECUTE
  grant so unauthenticated callers can no longer reach these RPCs over the
  public API — is verified directly (privilege checks + a live `anon` call
  returning `42501 permission denied`), not via this lint. See
  `sprint1-results.md`.
- `auth_leaked_password_protection` is an Auth dashboard toggle not exposed to
  the MCP tools; it remains a deferred manual step (§4).

## 3. Perf-probe timings (median + p95 per probe query)

**Status: not run** — see `perf-final.json`.

`scripts/perf-probe.ts` requires a service-role key in `.env.local` plus
installed `@supabase/supabase-js`, and must not be pointed at production. This
remote audit environment has neither the credentials (only `.env.example`) nor
installed `node_modules`, so the probe could not run — consistent with Sprints 2
and 3. No `perf-baseline.json` was ever captured either, so there is **no
recorded median/p95 baseline to diff against**.

| Probe query | Baseline median / p95 | Final median / p95 |
|---|---|---|
| `SELECT * FROM trips WHERE group_id = $1 LIMIT 50` | not captured | not run |
| `SELECT * FROM fillups WHERE group_id = $1 LIMIT 50` | not captured | not run |
| `SELECT * FROM push_subscriptions WHERE user_id = $1` | not captured | not run |
| INSERT + DELETE round-trip on `trips` | not captured | not run |

Expected impact of the shipped DB changes on these probes is **none**: `0019`
only indexes `trip_disputes` (not probed); `0020` drops `trips_group_date_idx`
and `members_user_group_idx`, but the probe's `trips` query is served by the
retained `trips_group_id_idx` and `members` is not probed. To capture real
timings, run locally against a dev/preview branch per the steps in
`perf-final.json` / `README.md`.

## 4. Changes shipped (baseline → final)

Three migrations were applied to the live project (versions confirmed via
`list_migrations`), each with a corresponding repo migration and commit:

| Sprint | Migration file | Live version | Commit | What it did |
|---|---|---|---|---|
| 1 | [`0018_secdef_lockdown.sql`](../../supabase/migrations/0018_secdef_lockdown.sql) | `20260529143305` | [`c401809`](https://github.com/alessandrocruz5/carpool-calculator/commit/c401809) — *fix(security): revoke EXECUTE on SECURITY DEFINER functions from anon* | Revoked implicit `PUBLIC`/`anon` EXECUTE on all `SECURITY DEFINER` functions; re-granted `authenticated` only where needed. |
| 2 | [`0019_perf_advisor_fixes.sql`](../../supabase/migrations/0019_perf_advisor_fixes.sql) | `20260529150801` | [`4b405cc`](https://github.com/alessandrocruz5/carpool-calculator/commit/4b405cc) — *perf(db): add covering index on trip_disputes.resolved_by FK* | Added `trip_disputes_resolved_by_idx`, clearing the one `unindexed_foreign_keys` finding. |
| 3 | [`0020_drop_unused_indexes.sql`](../../supabase/migrations/0020_drop_unused_indexes.sql) | `20260529153000` | [`e1356b3`](https://github.com/alessandrocruz5/carpool-calculator/commit/e1356b3) — *perf: drop unused indexes* | Dropped 2 genuinely redundant composite indexes (`trips_group_date_idx`, `members_user_group_idx`) confirmed unused against live stats; no FK left uncovered. |

Supporting documentation commits: `9940070` (RLS policy analysis),
`6bcddc3` (sprint 2 results), `6ceae1a` (index drop plan), `139bf7d` (sprint 3
results), `ec4d608` (client-fetching audit).

## 5. Remaining items — deferred (with rationale)

1. **6 `authenticated_security_definer_function_executable` WARN — KEEP.**
   These RPCs must be callable by signed-in users; authorization is enforced in
   the function bodies / API routes, and the dangerous `anon`/`PUBLIC` grant was
   already removed (Sprint 1). Switching them to `SECURITY INVOKER` would break
   the RLS-bypass they rely on (esp. the `is_group_member` / `is_group_driver`
   predicates used *inside* RLS policies). Accepted as designed.

2. **`auth_leaked_password_protection` WARN — DEFER (manual).** This is an Auth
   dashboard setting not exposed to the Supabase MCP tools. Action: enable
   "Leaked password protection" (HaveIBeenPwned) in Dashboard → Auth → Policies
   → Password, then verify a known-leaked password is rejected on signup.

3. **18 `unused_index` INFO — DEFER, do not drop.** The DB is ~1 week old with
   minimal query traffic, so "unused" means "not queried yet," not "redundant."
   13 are single-column FK-covering indexes — dropping them would re-introduce
   `unindexed_foreign_keys` warnings and slow cascade deletes/joins. Re-evaluate
   after a real production usage window (`pg_stat_user_indexes`).

4. **`trip_payments_passenger_unpaid_idx` — DEFER with a decision rule.** This
   partial index covers an unpaid-payments feature path that has not seen
   traffic. Per the Sprint 3 follow-up: on **2026-06-05**, if the path has seen
   traffic and the index is still unused, drop it — but note its FK
   (`trip_payments_passenger_id_fkey`, `ON DELETE RESTRICT`) would then need a
   **full** `(passenger_id)` index, since the partial one cannot serve the
   RESTRICT check.

5. **Perf-probe timings — DEFER (environment).** Capture median/p95 by running
   `scripts/perf-probe.ts` locally against a dev/preview branch with a
   service-role key (steps in `perf-final.json`). No regression is expected from
   the shipped changes (§3).

6. **Index-usage re-check — scheduled 2026-06-05.** Re-run
   `get_advisors type=performance` and inspect `pg_stat_user_indexes` /
   `pg_stat_user_tables` for any new sequential-scan pressure after the `0020`
   drops, and to widen the usage window for the KEEP/DEFER set.

---

### Bottom line

- Performance findings: **20 → 18** (cleared the one structural
  `unindexed_foreign_keys`; dropped 2 redundant composite indexes). Zero
  WARN-level performance lints throughout.
- Security findings: **7 → 7** by design — the real fix (removing
  `anon`/`PUBLIC` EXECUTE) is verified directly; the surviving warnings are
  intentional `authenticated` access plus one manual Auth toggle.
- All three remediation migrations are applied live and tracked in the repo with
  commits. Remaining items are deferred with explicit rationale and a dated
  re-check.

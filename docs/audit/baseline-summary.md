# Baseline Audit Summary

Snapshot date: 2026-05-28
Project: `vcmarwmweysxqhhgdcwc` (carpool-calculator)
Latest applied migration: `20260525072641_0013_perf_rls_fixes`

Source data:
- `baseline-tables.json` — `list_tables(public, verbose)`
- `baseline-perf-advisors.json` — `get_advisors(performance)`
- `baseline-security-advisors.json` — `get_advisors(security)`
- `baseline-migrations.json` — `list_migrations`

## RLS `auth.uid()` re-evaluation

**No advisor lints reported.** Migration `0013_perf_rls_fixes` appears to
have already converted policies to use `(SELECT auth.uid())` form. To
re-confirm during the cleanup pass, query `pg_policies` for any
`qual`/`with_check` containing bare `auth.uid()` (not wrapped in a
sub-select).

## Duplicate permissive policies

**No advisor lints reported.** Same caveat as above — verify via
`pg_policies` grouped by `(schemaname, tablename, cmd, roles)` to confirm
no table has multiple permissive policies for the same role + command.

## Unused indexes (20 findings — all `INFO`)

Many were added by `perf_indexes` / `0013_perf_rls_fixes` and have not
been read by the planner yet (low row counts, fresh stats). Candidates
listed; do NOT drop yet — re-evaluate after real traffic.

| Table | Index |
|---|---|
| `public.trips` | `trips_group_date_idx` |
| `public.trips` | `trips_car_id_idx` |
| `public.trips` | `trips_driver_user_id_idx` |
| `public.trips` | `trips_gas_price_id_idx` |
| `public.members` | `members_user_group_idx` |
| `public.members` | `members_group_id_idx` |
| `public.members` | `members_passenger_id_idx` |
| `public.trip_legs` | `trip_legs_group_id_idx` |
| `public.trip_leg_riders` | `trip_leg_riders_group_id_idx` |
| `public.trip_leg_riders` | `trip_leg_riders_passenger_id_idx` |
| `public.fillups` | `fillups_car_id_idx` |
| `public.fillups` | `fillups_owner_user_id_idx` |
| `public.groups` | `groups_owner_user_id_idx` |
| `public.member_invites` | `member_invites_invited_by_idx` |
| `public.trip_disputes` | `trip_disputes_group_status_idx` |
| `public.trip_disputes` | `trip_disputes_trip_idx` |
| `public.trip_disputes` | `trip_disputes_reporter_idx` |
| `public.trip_payments` | `trip_payments_passenger_unpaid_idx` |
| `public.push_subscriptions` | `push_subscriptions_user_id_idx` |

### Unindexed foreign key (separate `INFO` lint)

- `public.trip_disputes.trip_disputes_resolved_by_fkey` — no covering
  index on `resolved_by`. Add `CREATE INDEX ON public.trip_disputes
  (resolved_by);` during cleanup.

Reference: <https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys>
and <https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index>

## SECURITY DEFINER exposure (6 `WARN`)

All `SECURITY DEFINER` and callable by `authenticated` via PostgREST
`/rest/v1/rpc/*`:

| Function | Signature |
|---|---|
| `public.claim_member_invite` | `()` |
| `public.create_group` | `(p_name text)` |
| `public.rename_group` | `(p_group_id uuid, p_name text)` |
| `public.link_member_by_email` | `(p_group_id uuid, p_email text, p_role text)` |
| `public.is_group_member` | `(gid uuid)` |
| `public.is_group_driver` | `(gid uuid)` |

Action for next task: review each — the RPCs that mutate state on behalf
of the caller (`create_group`, `rename_group`, `claim_member_invite`,
`link_member_by_email`) likely need to stay `SECURITY DEFINER` but must
re-verify `auth.uid()` and group ownership inside the body. The
predicate helpers `is_group_member` / `is_group_driver` are used in RLS
policies; they need `SECURITY DEFINER` to bypass RLS on `members` while
checking membership, and should `SET search_path = ''` and be marked
`STABLE`. Confirm both, then suppress the advisor.

Reference: <https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable>

## Auth config

- **Leaked password protection: DISABLED** (`WARN`). Enable
  HaveIBeenPwned check in Auth → Providers → Email settings.
  Reference: <https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection>

No MFA / OTP advisories flagged in this snapshot.

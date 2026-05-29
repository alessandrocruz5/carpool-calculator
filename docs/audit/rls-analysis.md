# RLS Policy Analysis

**Date:** 2026-05-29
**Project:** `vcmarwmweysxqhhgdcwc` (sabay)
**Raw dump:** [`rls-policies-before.json`](./rls-policies-before.json)
**Source query:**

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;
```

## Scope of the dump

53 PERMISSIVE policies across 18 tables in `public`. Every policy targets the
`authenticated` role only — no policy is granted to `anon` or `public`. Two
families of policy account for almost everything:

- **Group-scoped tables** (`fillups`, `gas_prices`, `member_invites`, `members`,
  `passengers`, `settings`, `trip_legs`, `trip_leg_riders`, `trip_payments`,
  `trips`, plus `groups`, `trip_disputes`): authorization is delegated to the
  `is_group_member(group_id)` / `is_group_driver(group_id)` SECURITY DEFINER
  helpers. Reads use `is_group_member`; writes use `is_group_driver`.
- **User-owned tables** (`cars`, `groups`, `profiles`, `push_subscriptions`):
  authorization compares an ownership column directly against the caller's id.

## Finding 1 — Bare `auth.uid()` in `qual` / `with_check`

**None found.** Every reference to the current user is already wrapped as the
InitPlan-friendly `(SELECT auth.uid())` form. Concretely, all of the following
already use the subquery wrapper:

| Table | Policies referencing `auth.uid()` |
|-------|-----------------------------------|
| `cars` | `cars_delete_own`, `cars_insert_own`, `cars_select`, `cars_update_own` |
| `groups` | `groups_delete`, `groups_insert`, `groups_update` |
| `profiles` | `profiles_select`, `profiles_update_own` |
| `push_subscriptions` | `push_delete_own`, `push_insert_own`, `push_select_own`, `push_update_own` |
| `trip_disputes` | `trip_disputes_insert` |

The group-scoped policies do not reference `auth.uid()` directly at all — they
call `is_group_member` / `is_group_driver`, which resolve the caller's id
inside the function body.

There is therefore **no `auth.uid()` → `(select auth.uid())` rewrite work
remaining** on this database. This is corroborated by the performance advisor
run (see "Advisor corroboration" below), which reports **zero**
`auth_rls_initplan` warnings.

## Finding 2 — Multiple PERMISSIVE policies for the same (role, cmd)

**None found.** Every table has at most one policy per command, all for the
single role `authenticated`. There are no overlapping PERMISSIVE policies that
Postgres would have to OR together at query time, so there are **no merge
candidates**.

### Re-checking the focus areas called out in the audit brief

The brief flagged three areas as suspected problems. All three have already
been consolidated on the live database:

| Focus area (per brief) | Live state in dump | Status |
|------------------------|--------------------|--------|
| `push_subscriptions` — "4 policies" | 4 policies, but one each for SELECT / INSERT / UPDATE / DELETE (`push_select_own`, `push_insert_own`, `push_update_own`, `push_delete_own`). No two share a (role, cmd). | ✅ Not a duplicate — nothing to merge |
| `cars` — "`cars_select_own` + `cars_select_shared`" | A single SELECT policy `cars_select` whose `qual` already ORs the two cases: `owner_user_id = (select auth.uid())` **OR** an `EXISTS` over `trips`/`members`. | ✅ Already merged |
| `profiles` — "`profiles_select_own` + `profiles_select_comembers`" | A single SELECT policy `profiles_select` whose `qual` already ORs own-row access with the co-member `EXISTS` self-join over `members`. | ✅ Already merged |

The split policy names from the brief (`cars_select_own`, `cars_select_shared`,
`profiles_select_own`, `profiles_select_comembers`) do **not** exist on the
database; they have been replaced by the merged `cars_select` / `profiles_select`
policies.

## Advisor corroboration

A performance advisor run at the same time
(`mcp__supabase__get_advisors`, type `performance`) reports **no**
`auth_rls_initplan` warnings and **no** `multiple_permissive_policies`
warnings. The only performance lints present are `unindexed_foreign_keys`
(1 × `trip_disputes_resolved_by_fkey`) and `unused_index` (20 INFO-level
entries) — both unrelated to RLS policy structure and out of scope for this
RLS audit.

## Conclusion

The two classes of RLS issue this audit targets — bare `auth.uid()` calls and
duplicate same-(role, cmd) PERMISSIVE policies — are **already remediated** on
`vcmarwmweysxqhhgdcwc`. No policy migration is required for these items. The
captured `rls-policies-before.json` serves as the verified baseline for any
future change.

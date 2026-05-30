# Audit Remediation Plan — Sprints with Claude Prompts

Granular execution plan to address the database audit findings (RLS perf, duplicate policies, unused indexes, SECURITY DEFINER exposure, auth hardening). Each sprint is scoped to be completable in a single focused Claude Code session. Copy the prompt into Claude Code and run it against this repo.

---

## Sprint 0 — Baseline & Safety Net (½ day)

Goal: capture current state so we can prove the fixes work and roll back if needed.

### Task 0.1 — Snapshot current schema + advisors

**Claude prompt:**
```
Use the Supabase MCP tools to capture the current state of the project before we make changes.

1. Run list_tables and save the output to docs/audit/baseline-tables.json
2. Run get_advisors with type="performance" and save to docs/audit/baseline-perf-advisors.json
3. Run get_advisors with type="security" and save to docs/audit/baseline-security-advisors.json
4. Run list_migrations and save to docs/audit/baseline-migrations.json
5. Summarize the findings in docs/audit/baseline-summary.md grouped by: RLS auth.uid re-eval, duplicate permissive policies, unused indexes, SECURITY DEFINER exposure, auth config.

Commit on branch claude/focused-mendel-24i4o with message "docs: audit baseline snapshot".
```

### Task 0.2 — Capture CRUD timing baseline

**Claude prompt:**
```
Add a lightweight perf probe so we can measure the impact of upcoming RLS/index changes.

1. Create scripts/perf-probe.ts that, given a SUPABASE_URL and a service-role key from env, runs and times these queries 10x each (median + p95):
   - SELECT * FROM trips WHERE group_id = $1 LIMIT 50
   - SELECT * FROM fillups WHERE group_id = $1 LIMIT 50
   - SELECT * FROM push_subscriptions WHERE user_id = $1
   - INSERT/DELETE round-trip on a throwaway row in trips
2. Output JSON to docs/audit/perf-baseline.json
3. Document how to run it in docs/audit/README.md
4. Do NOT run it against prod; just wire it up. Mention in the README that the user should run it manually with their own creds.

Commit as "chore: add CRUD perf probe script".
```

---

## Sprint 1 — Lock Down SECURITY DEFINER Functions (1 day, BLOCKS GO-LIVE)

Goal: remove anon/authenticated EXECUTE on dangerous SECURITY DEFINER functions.

### Task 1.1 — Inventory exposed functions

**Claude prompt:**
```
Use the Supabase MCP execute_sql tool to list every SECURITY DEFINER function in the public schema and its current grantees. Run:

  SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args,
         p.prosecdef, r.rolname AS granted_to, a.privilege_type
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN information_schema.routine_privileges a
    ON a.specific_schema='public' AND a.routine_name = p.proname
  LEFT JOIN pg_roles r ON r.rolname = a.grantee
  WHERE n.nspname='public' AND p.prosecdef = true
  ORDER BY p.proname;

Save the result to docs/audit/secdef-inventory.md as a table. For each function, classify as:
  - TRIGGER-ONLY (e.g. handle_new_user) → revoke EXECUTE from anon, authenticated, public
  - RPC, member-only (e.g. rename_group) → revoke from anon, keep for authenticated
  - RPC, callable by anyone → leave but document why

Commit as "docs: inventory SECURITY DEFINER functions".
```

### Task 1.2 — Write the revoke migration

**Claude prompt:**
```
Create supabase/migrations/0018_secdef_lockdown.sql that:

1. For handle_new_user: REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon, authenticated
2. For is_group_driver, is_group_member: REVOKE from anon (keep authenticated — they're used in RLS)
3. For link_member_by_email, rename_group: REVOKE from anon; keep authenticated
4. For the remaining 9 SECURITY DEFINER functions classified in docs/audit/secdef-inventory.md, apply the matching revoke based on its classification

Read 0012_security_revoke_public_execute.sql first to avoid duplicating prior revokes. Use IF EXISTS guards. Add a comment header explaining the threat model (anon role could call these directly via PostgREST).

Do NOT apply yet — just write the file. Commit as "fix(security): revoke EXECUTE on SECURITY DEFINER functions from anon".
```

### Task 1.3 — Apply + verify

**Claude prompt:**
```
1. Apply supabase/migrations/0018_secdef_lockdown.sql using the Supabase MCP apply_migration tool
2. Re-run get_advisors type="security" and save to docs/audit/post-sprint1-security-advisors.json
3. Diff against docs/audit/baseline-security-advisors.json and write the diff to docs/audit/sprint1-results.md
4. Manually test (via execute_sql) that calling rename_group as the anon role fails with "permission denied"
5. Commit results as "docs: sprint 1 lockdown results"
```

### Task 1.4 — Enable leaked password protection

**Claude prompt:**
```
The Supabase MCP tools don't expose auth config directly. Add a manual checklist item:

1. Append to docs/audit/sprint1-results.md a section "Manual steps" with:
   - [ ] Enable "Leaked password protection" in Supabase Dashboard → Auth → Policies → Password
   - [ ] Verify by attempting signup with password "password123" (should reject)
2. Open a tracking issue via mcp__github__issue_write titled "Enable leaked password protection in Supabase Auth" with the checklist as the body.
```

---

## Sprint 2 — RLS Policy Performance Fixes (½ day)

Goal: eliminate per-row auth.uid() re-eval and merge duplicate permissive policies.

### Task 2.1 — Audit current policies

**Claude prompt:**
```
Use execute_sql to dump all RLS policies:

  SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname;

Save raw to docs/audit/rls-policies-before.json. Then write docs/audit/rls-analysis.md listing:
  - Policies whose qual or with_check contains bare `auth.uid()` (needs (select auth.uid()))
  - Tables with multiple PERMISSIVE policies for the same (role, cmd) — candidates to merge
Focus areas from the audit: push_subscriptions (4 policies), cars (cars_select_own + cars_select_shared), profiles (profiles_select_own + profiles_select_comembers).

Commit as "docs: RLS policy analysis".
```

### Task 2.2 — Write the RLS fix migration

**Claude prompt:**
```
Create supabase/migrations/0019_rls_perf_fixes.sql that:

1. For push_subscriptions: DROP and recreate the 4 policies, replacing every `auth.uid()` with `(select auth.uid())`. Preserve the original USING/WITH CHECK logic exactly.
2. For cars: DROP cars_select_own and cars_select_shared; CREATE a single cars_select policy with `USING (owner_id = (select auth.uid()) OR <shared condition from cars_select_shared>)`.
3. For profiles: same merge pattern for profiles_select_own and profiles_select_comembers.
4. Scan rls-analysis.md for any other tables with bare auth.uid() and apply the same fix.

Use BEGIN/COMMIT. Add comments naming the original policy for each replacement. Do NOT change the semantic — only the evaluation strategy.

Commit as "perf(rls): wrap auth.uid() in subselect and merge duplicate policies".
```

### Task 2.3 — Apply + verify

**Claude prompt:**
```
1. Apply 0019_rls_perf_fixes.sql via apply_migration.
2. Re-run get_advisors type="performance"; save to docs/audit/post-sprint2-perf-advisors.json.
3. Diff against baseline; write docs/audit/sprint2-results.md showing how many "Auth RLS Initialization Plan" and "Multiple Permissive Policies" warnings cleared.
4. Re-run scripts/perf-probe.ts and append the new timings to sprint2-results.md alongside baseline.
5. Smoke test: as an authenticated user, SELECT from push_subscriptions, cars, profiles — confirm same rows returned as before.

Commit as "docs: sprint 2 RLS perf results".
```

---

## Sprint 3 — Drop Unused Indexes (½ day)

Goal: remove the 16 unused indexes to speed up writes.

### Task 3.1 — Confirm unused with usage stats

**Claude prompt:**
```
Use execute_sql to verify each "unused" index claim with real usage data:

  SELECT schemaname, relname AS table, indexrelname AS index,
         idx_scan, idx_tup_read, pg_size_pretty(pg_relation_size(indexrelid)) AS size
  FROM pg_stat_user_indexes
  WHERE schemaname='public'
  ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;

Save to docs/audit/index-usage.json. Then in docs/audit/index-drop-plan.md, list each unused index from the audit (16 across trips, members, fillups, groups, trip_legs, trip_leg_riders, trip_payments, member_invites, push_subscriptions) with:
  - idx_scan count (0 = safe to drop)
  - Whether it backs a FK or UNIQUE constraint (DO NOT DROP if so)
  - Size
  - Decision: DROP / KEEP / DEFER (and why)

Be conservative: if idx_scan > 0 OR backs a constraint, mark KEEP/DEFER.

Commit as "docs: index drop plan with usage stats".
```

### Task 3.2 — Write the drop migration

**Claude prompt:**
```
Create supabase/migrations/0020_drop_unused_indexes.sql with DROP INDEX IF EXISTS for every index marked DROP in docs/audit/index-drop-plan.md. Use CONCURRENTLY where possible (note: can't be in a transaction block, so put each on its own statement and remove BEGIN/COMMIT, or use a separate non-transactional migration).

Add a rollback comment block at the bottom showing the CREATE INDEX statements (reverse-engineered from pg_indexes) so we can restore quickly if anything regresses.

Commit as "perf: drop unused indexes".
```

### Task 3.3 — Apply + monitor

**Claude prompt:**
```
1. Apply 0020_drop_unused_indexes.sql.
2. Re-run perf-probe; append to docs/audit/sprint3-results.md.
3. Re-run get_advisors type="performance"; diff vs sprint 2.
4. Set a 1-week reminder in docs/audit/sprint3-results.md: "Re-check pg_stat_user_indexes on $(date+7d) to confirm no slow queries now scanning sequentially."

Commit as "docs: sprint 3 index drop results".
```

---

## Sprint 4 — Client-Side Data Fetching Audit (1–2 days)

Goal: find the navigation-slowness culprits in Next.js code.

### Task 4.1 — Map data-fetching patterns

**Claude prompt:**
```
Audit the Next.js app for data-fetching patterns. Produce docs/audit/client-fetching-audit.md with:

1. Every `'use client'` component that calls supabase.from(...) directly (these block first paint). List file:line.
2. Every route that does sequential awaits where Promise.all would work.
3. Pages without revalidate/cache hints that could use ISR or React cache().
4. Components that re-fetch the same data on every render (no SWR/React Query).
5. Bundle size: run `next build` and capture the output; flag any route chunk > 200 KB.

Use grep/find liberally. Do not change code yet.

Commit as "docs: client-side fetching audit".
```

### Task 4.2 — Pick top 3 wins, implement

**Claude prompt:**
```
From docs/audit/client-fetching-audit.md, pick the 3 highest-impact fixes (biggest user-visible navigation wins). For each:

1. Convert the client component to a Server Component where it doesn't need interactivity, OR
2. Add React cache() / unstable_cache around the supabase call, OR
3. Parallelize sequential awaits

Make one commit per fix with a clear before/after note in the message. Test each with `npm run build && npm run start` and confirm the route still renders.

Do NOT do all of them at once — three is the cap for this sprint.
```

---

## Sprint 5 — Re-Audit & Sign-Off (¼ day)

### Task 5.1 — Full re-audit

**Claude prompt:**
```
Final pass:

1. Run get_advisors for both performance and security; save to docs/audit/final-advisors.json
2. Run scripts/perf-probe.ts; save to docs/audit/perf-final.json
3. Write docs/audit/final-report.md comparing baseline → final for:
   - Count of perf advisor warnings (by category)
   - Count of security advisor warnings
   - Median + p95 timing for each probe query
   - List of changes shipped (link to each migration + commit)
4. List any remaining items to defer with rationale.

Commit as "docs: audit remediation final report".
```

---

## Execution Notes

- All work goes on `claude/focused-mendel-24i4o`. Don't merge to main until Sprint 1 + Sprint 5 are both done.
- Each sprint's migrations are independent — if Sprint 3 regresses something, you can revert just that migration without touching Sprints 1–2.
- Do NOT run perf-probe against prod with real user load; use a staging branch (Supabase MCP `create_branch`) or off-peak window.
- Stop and ask the user before applying any migration that drops > 5 objects at once.

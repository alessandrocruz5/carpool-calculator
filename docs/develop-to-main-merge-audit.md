# Audit Trail — Merge `develop` → `main`

**Date prepared:** 2026-05-30
**Prepared on branch:** `claude/eloquent-cori-bKnHk`
**Status:** Pre-merge review (no merge has been performed by this document)

---

## 1. Merge metadata

| Field | Value |
|-------|-------|
| Source branch | `origin/develop` |
| Target branch | `origin/main` |
| Target tip (base) | `2bb2175` — 2026-05-25 16:00:59 +0800 |
| Source tip (head) | `0c40611` — 2026-05-30 10:20:38 +0800 |
| Commits ahead (`main..develop`) | 64 |
| Commits behind (`develop..main`) | 0 |
| Merged PRs in range | 26 (#62–#88) |
| Files changed | 136 |
| Line delta | +13,728 / −2,905 |

### Merge readiness

`develop` is **strictly ahead** of `main`: every commit on `main` is already
contained in `develop` (`git rev-list --count origin/develop..origin/main` = 0).
The merge therefore introduces **no divergence and no conflicts** — it can be
fast-forwarded or recorded as a no-conflict merge commit.

Verification commands:

```bash
git fetch origin
git log --oneline origin/main..origin/develop   # 64 commits to be merged
git log --oneline origin/develop..origin/main    # empty -> main fully contained
git diff --stat origin/main..origin/develop      # 136 files, +13728 / -2905
```

---

## 2. Database migrations introduced

The merge reconciles migration filenames to the Supabase timestamp convention
(`0001_init.sql` → `20260522023000_init.sql`, etc. — content unchanged, renames
only) and adds the following **new** migrations:

| Migration | Purpose |
|-----------|---------|
| `20260529140000_trip_disputes.sql` | Passenger-facing trip dispute schema |
| `20260529143305_secdef_lockdown.sql` | `SECURITY DEFINER` function lockdown |
| `20260529150801_perf_advisor_fixes.sql` | Performance advisor remediations |
| `20260529153000_drop_unused_indexes.sql` | Drop unused indexes |
| `20260529165131_audit_log.sql` | Audit-log table + triggers |
| `20260530001126_trip_archive.sql` | Trip archival schema |
| `20260530001400_perf_v2.sql` | Second performance pass |
| `20260530004033_secdef_lockdown_audit_archive.sql` | Lockdown for audit/archive functions |
| `20260530015847_schedule_audit_log_prune.sql` | `pg_cron` schedule to prune `audit_log` |

> **Pre-merge action required:** confirm these migrations have been applied (or
> are queued to apply) against the production Supabase project that `main`
> deploys to. Renames are inert, but the 9 new migrations are schema-affecting.

---

## 3. Change categories

### Security & database hardening
- Revoked `EXECUTE` on `SECURITY DEFINER` functions from `anon`.
- Inventory + lockdown of `SECURITY DEFINER` functions (`docs/audit/secdef-inventory.md`).
- Audit-log table with scheduled pruning via `pg_cron`.
- RLS policy analysis and performance fixes (`docs/audit/rls-analysis.md`).
- Dropped unused indexes; added covering index on `trip_disputes.resolved_by`.

### Product features
- Passenger-facing **trip dispute** flow (`app/api/disputes/*`, `app/admin/DisputesPanel.tsx`).
- **Trip archive** admin panel (`app/admin/ArchiveTripsPanel.tsx`, `app/api/admin/archive-trips`).
- **Admin audit** view (`app/admin/audit/page.tsx`).
- Account management: data export, account delete, change-email
  (`app/api/account/*`).
- Auth: magic-link route, confirm-flow updates, error page.
- Onboarding tour, install banner/page, legal pages (privacy/terms/contact),
  changelog page, loading skeletons across routes.

### Performance
- Deduped auth `getClaims()` per request via React `cache()`.
- Parallelized `/api/account/export`.
- Read `userId` from profile store instead of client `getClaims()`.

### Observability & tooling
- Sentry client/edge/server configs + `instrumentation.ts`.
- CRUD performance probe script; vitest config addition.

### Documentation (audit remediation)
- Full audit baseline + sprint results under `docs/audit/`
  (`baseline-summary.md`, `sprint1–3-results.md`, `final-report.md`, etc.).

---

## 4. Merged pull request index (#62–#88)

| PR | Merge commit | Branch |
|----|--------------|--------|
| #62 | `cbec36e` | admiring-mccarthy |
| #63 | `fa6392b` | sleepy-allen |
| #64 | `2cce608` | festive-archimedes |
| #65 | `883fe32` | youthful-knuth |
| #66 | `d24e4fc` | cool-euler |
| #67 | `fbab4b9` | eloquent-heisenberg |
| #68 | `ea29665` | exciting-cori |
| #69 | `0c0d21d` | wonderful-edison |
| #70 | `aa16525` | great-clarke |
| #71 | `4c18929` | trusting-bohr |
| #72 | `2ec667b` | sharp-noether |
| #73 | `896ebe2` | confident-galileo |
| #74 | `9b717ed` | dreamy-clarke |
| #75 | `efa1bd0` | focused-mendel |
| #76 | `3cd1249` | elegant-sagan |
| #77 | `44fd486` | focused-mendel |
| #78 | `fcfedad` | vigilant-thompson |
| #79 | `d147dcc` | cool-goodall |
| #80 | `1f5a0b7` | amazing-goodall |
| #82 | `bf88e1b` | cool-tesla |
| #83 | `5f178c0` | funny-mccarthy |
| #84 | `f63b1a3` | admiring-hypatia |
| #85 | `bd8f6a3` | wizardly-darwin |
| #86 | `e063e17` | inspiring-euler |
| #87 | `56125b1` | stoic-clarke |
| #88 | `0c40611` | great-planck |

---

## 5. Pre-merge checklist

- [ ] CI green on `develop` tip (`0c40611`) — lint/build/tests.
- [ ] 9 new Supabase migrations applied or queued against production project.
- [ ] `pg_cron` extension available for `20260530015847_schedule_audit_log_prune.sql`.
- [ ] Sentry DSN / env vars present in the `main` deployment target.
- [ ] Stakeholder sign-off recorded below.

## 6. Sign-off

| Role | Name | Date | Decision |
|------|------|------|----------|
| Author | | | |
| Reviewer | | | |
| Release approver | | | |

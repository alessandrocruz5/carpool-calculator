---
type: plan
kind: feature
status: done
repo: carpool-calculator
delivery: pr
base: develop
sprint: 9
epic: SABAY-50
created: 2026-10-29
risk: medium
prompts: 2
graph_built: none
tags: [plan]
---
# Keep Supabase awake

## Request
> keep Supabase awake: allow /api/health past the auth middleware + daily keep-alive cron

| # | Requirement |
|---|---|
| R1 | A signed-out `GET /api/health` reaches the route handler. No 307 to `/auth/login`; it returns the existing `{status, db, timestamp}` JSON with 200, or 503 when the DB ping fails. |
| R2 | A daily scheduled job calls `/api/health` in production, so the Supabase project gets real API traffic every day, well inside the free tier's 7-day inactivity pause window. |

## Context used
- Code: `middleware.ts:4-12`: every non-static path, including `/api/*`, runs `updateSession`. The matcher excludes only static assets.
- Code: `lib/supabase/middleware.ts:47-60`: signed-out requests are redirected to `/auth/login` unless the path is `/`, `/login*`, `/auth*` or `/legal*`. `/api/health` isn't listed, so today a signed-out request gets a 307 and never reaches the handler. **This is why the request exists.**
- Code: `lib/supabase/middleware.ts:67-70`: `isPageRoute` is false for `/api/*`, so an exempted API path skips the member lookups. The trusted-header strip (`:174-180`) still runs on every non-redirect response.
- Code: `app/api/health/route.ts:1-29`: `GET` runs a service-role (`createAdminClient`) `settings.select("group_id").limit(1)` with a 5 s abort. That is real PostgREST traffic, which counts as project activity. It reads no cookies or headers.
- Code: `vercel.json:1-8`: one existing cron (`/api/push/send`, `0 0 * * 2`). Pattern to copy.
- Code: `app/api/push/send/route.ts:9-22`: cron routes authenticate with `CRON_SECRET`. That cron is **also** redirected by the middleware, because Vercel cron requests carry no session cookie (see Non-goals).
- Code: `lib/supabase/middleware.test.ts:200-242`: the `"updateSession public landing at /"` describe has signed-out cases (`setSupa({ auth: { userId: null } })`, `makeRequest`, `forwardedHeader`). New tests go here.
- Note: `docs/ops/uptime.md` (Monitor 1): the BetterStack monitor targets `/api/health` with "Follow redirects: Yes". Today it would follow the 307 to the login page and report green **without touching the DB**. After this change it measures real DB health.
- Note: `docs/ops/environments.md:37`: `CRON_SECRET` is set in prod and staging and unset in previews.
- Note: `docs/ops/backups.md`: documents a weekly `pg_dump` GitHub Action, but `.github/workflows/` only has `ci.yml`. Nothing else in the repo generates scheduled DB activity today.
- Note: TASKS.md: newest is Sprint 8 (base `develop`, Jira key `SABAY`). This plan is Sprint 9.

## Decisions
- **Keep-alive mechanism: a Vercel cron on the existing `/api/health`**, with no new route. It reuses the endpoint that already does a DB ping, matches the existing `vercel.json` cron pattern, needs no new secret and no dependency, and runs where prod runs. Alternatives rejected:
  - A GitHub Actions scheduled workflow. GitHub disables these after 60 days without repo activity, which is exactly when a quiet carpool app needs the job.
  - Supabase `pg_cron`. It runs inside the DB and doesn't count as external activity, so it doesn't prevent the pause.
  - Relying on the BetterStack monitor in `docs/ops/uptime.md`. It's documented but not confirmed live, and it's outside the repo.
- **Exempt `/api/health` inside `updateSession` with an exact-match `pathname !== '/api/health'`**, not by editing the `middleware.ts` matcher regex. This matches the existing `/legal` allowlist style and is unit-testable in `middleware.test.ts`, whereas the matcher regex has no tests. Exact match, not `startsWith`: a prefix match would expose any future `/api/health*` sibling. The cost is one `getClaims()` call per health hit, which is a local no-op with no cookie.
- **Schedule `0 1 * * *`** (daily, 01:00 UTC = 09:00 PHT). Daily is the most frequent schedule Vercel Hobby allows, and it gives 7× margin on the 7-day pause window. Two crons in total fit every Vercel plan.
- **The cron call is unauthenticated.** `/api/health` is meant to be public (uptime monitor). If `CRON_SECRET` is set, Vercel sends `Authorization: Bearer …`, and the handler ignores it. The response contains only `status`/`db`/`timestamp`.
- Jira key `SABAY` and base `develop` are taken from TASKS.md, because the repo CLAUDE.md has no `## Project` / `## Workflow` profile. The audit should confirm this.

**Non-goals:**
- **`/api/push/send` is blocked by the same middleware gate.** The Tuesday stale-gas push has likely never fired in prod. The user chose (2026-10-29) to fix it as a **separate hotfix**, because reviving a dormant notification is a driver-visible change. Follow-up: `/plan-feature hotfix: let /api/push/send past the auth middleware (CRON_SECRET-gated)`.
- Changing how signed-out `/api/*` requests fail in general (307 → 401).
- Rate-limiting `/api/health`. The query is a trivial `limit(1)`, and this restores the endpoint's intended public design.
- Keeping staging or preview Supabase branches awake. Vercel crons run only on the production deployment.
- Restoring an already-paused project. That's a manual action in the Supabase dashboard.
- Creating the documented-but-missing `weekly-backup.yml`.
- Editing the `middleware.ts` matcher.

## Change list
| File | Action | Why | Req | Prompt |
|---|---|---|---|---|
| `lib/supabase/middleware.ts` | M | Add `pathname !== '/api/health'` to the signed-out redirect guard (`:49-55`) and update the comment above it. | R1 | 01 |
| `lib/supabase/middleware.test.ts` | M | Signed-out `/api/health` → 200 with no `location`. `/api/healthz` and `/api/health/x` still → 307 `/auth/login`. The spoofed `x-user-id` is still stripped on `/api/health`. | R1 | 01 |
| `vercel.json` | M | Add the cron `{ "path": "/api/health", "schedule": "0 1 * * *" }`. | R2 | 02 |
| `docs/ops/uptime.md` | M | Short "Supabase keep-alive" section: the cron, why it exists, how to verify it, and that a paused project needs a manual restore. | R2 (note) | 02 |

## Blast radius
**Risk:** medium. It's a one-line edit, but it's in the auth middleware that gates every route, and a wrong predicate would open unauthenticated access.

| Affected | Kind | Via | Breaks? | Mitigation |
|---|---|---|---|---|
| `middleware.ts` → `updateSession` | Direct | Only caller. | No. Signature unchanged. | — |
| Every other signed-out path | Direct | Redirect guard | No. The exact match leaves other paths untouched. | Tests assert `/api/healthz`, `/api/health/x` and `/log` still redirect. |
| Signed-in requests to any path | Direct | Guard short-circuits on `!user` | No. | Existing `/admin` and landing tests stay green. |
| Trusted-header strip (`x-user-id`, `x-user-role`, `x-member-exists`, `x-landing`) | Direct | Runs after the guard | No. `/api/health` falls through to the strip. | Test asserts a spoofed `x-user-id` is stripped on `/api/health`. |
| `x-landing` flag | Direct | `isPublicLanding = !user && pathname === '/'` | No. Still exactly `/`. | — |
| `app/api/health/route.ts` | Transitive | Now reachable signed-out | No. It reads no session. | — |
| Supabase load | Non-graph | Public service-role query | Negligible. Anyone can call it, but it's `limit(1)` with a 5 s abort. | Non-goal. Revisit with the existing Upstash limiter if abused. |
| `vercel.json` crons | Non-graph | Deploy config | No. This is the second cron, daily, within Hobby limits. | Verify in Vercel → Settings → Cron Jobs after the prod deploy. |
| `/api/push/send` cron | Non-graph | Same middleware gate | Already broken. Unchanged by this plan. | Separate hotfix (Non-goals). |
| BetterStack Monitor 1 (`docs/ops/uptime.md`) | Non-graph | External HTTP contract | Behaviour changes: it now gets a real 200/503 instead of a followed redirect to the login page. It may start alerting on genuine DB failures, which is intended. | Documented in prompt 02. |
| e2e / RLS suites | Non-graph | — | No. None hit `/api/health` (grep). | — |

**Known risks in the touched area:** the `updateSession` comments warn against putting code between `createServerClient` and `getClaims()`. The edit is in the guard after it, so that's respected. The header-strip invariant (`:166-180`) must hold on every non-redirect path, and the new test pins it for `/api/health`. The assumption that a PostgREST request counts as activity for Supabase's pause detector is the standard approach but not something we can test in CI. Verify it after deploy with Supabase → Logs → API, which should show the daily `settings` select.

## Units
| Unit | Title | Category | Prompts | Depends | High-stakes | Acceptance criteria |
|---|---|---|---|---|---|---|
| SABAY-51 | Supabase keep-alive: public `/api/health` + daily cron | Added | 01, 02 | — | yes (auth middleware → code-guardian) | R1: signed-out `GET /api/health` returns the handler's JSON (200/503), not a 307 — already met by `7e79113` (all signed-out `/api/*` pass `isApiRoute`; covered in `middleware.test.ts` "does not redirect API routes"). R2: `vercel.json` declares a daily cron on `/api/health`. After the prod deploy, Vercel lists it, and Supabase API logs show a daily request. |

## Prompts
| # | Title | Unit | Model | Effort | Depends | Group | Files |
|---|---|---|---|---|---|---|---|
| 01 | Exempt `/api/health` from the signed-out redirect | SABAY-51 | opus | high | — | A | `lib/supabase/middleware.ts`, `lib/supabase/middleware.test.ts` |
| 02 | Daily keep-alive cron + ops note | SABAY-51 | haiku | low | 01 | B | `vercel.json`, `docs/ops/uptime.md` |

- 01 is on opus because it edits the auth gate that fronts every route. An off-by-one predicate (`startsWith`, wrong boolean) silently opens unauthenticated access.

## End-to-end verification
```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run e2e
# R1: unit-level proof
npx vitest run lib/supabase/middleware.test.ts
# R1: live proof (needs .env.local; run `npm run dev` in another shell)
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' http://localhost:3000/api/health   # expect "200 " (or "503 " if the DB is unreachable), never 307
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/log                            # expect 307
# R2: config proof
node -e 'const c=require("./vercel.json").crons; if(!c.some(x=>x.path==="/api/health"&&x.schedule==="0 1 * * *")) process.exit(1); if(!c.some(x=>x.path==="/api/push/send")) process.exit(1)'
# R2: post-deploy to prod (manual): Vercel → Settings → Cron Jobs lists /api/health, "Run" it once → 200;
#     the next day, Supabase → Logs → API shows the settings select from the cron.
```

## Rollback
Revert the SABAY-51 merge commit. The middleware goes back to redirecting `/api/health`, and the cron disappears on the next prod deploy. There's no data or schema change. If only the cron misbehaves, delete it in Vercel → Cron Jobs, or remove the `vercel.json` entry.

## Log
- 2026-10-29: planned. The user chose to split the `/api/push/send` middleware fix into a separate hotfix.
- 2026-10-29: audited (PASS), 0 fixes applied. 6 NOTEs, see [[2026-10-29-supabase-keep-alive.audit]]. Sprint 9 targets v2.4.0, since the Sprint 8 v2.3.0 roll-up is still outstanding.
- 2026-10-29: build started on SABAY-51; rollback point b84767baa251f99a8052f8ff32493d89e8ef268b
- 2026-10-29: 01 skipped (opus, 0 retries): R1 already shipped in `7e79113` (Sprint-era fix, 2026-09-08) — `isApiRoute` lets every signed-out `/api/*` through, with tests. Plan and audit missed it; the exact-match predicate would be dead code and the `/api/healthz` → 307 test would fail. User chose skip. Consequences: the unit no longer touches the auth middleware; the `/api/push/send` hotfix follow-up is moot (that cron is already unblocked).
- 2026-10-29: 02 done (haiku, 0 retries): daily `/api/health` cron (`0 1 * * *`) in vercel.json + "Supabase keep-alive" section in docs/ops/uptime.md. Doc bullet reworded to "middleware never redirects `/api/*`" to match 7e79113.
- 2026-10-29: shipped as PR #198 (b64c23f) to develop; local lint/tsc/test/build green, e2e green in CI (not runnable locally: no service key in .env.local).
- 2026-10-29: SABAY-51 merged (PR #198). Plan done.

## Outcome
Shipped: daily `/api/health` Vercel cron (`0 1 * * *`) and the "Supabase keep-alive" runbook section. Deviation: prompt 01 (middleware exemption) was skipped because `7e79113` (2026-09-08) already lets all signed-out `/api/*` through; the plan/audit missed it, and the separate `/api/push/send` hotfix is moot. Gotcha: before planning a middleware/auth change, check `git log -S` / the current file, not just the plan's assumptions. Still to verify after the prod deploy: Vercel Cron Jobs lists the entry, and Supabase API logs show the daily `settings` select.

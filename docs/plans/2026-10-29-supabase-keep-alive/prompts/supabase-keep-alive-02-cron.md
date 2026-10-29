---
type: prompt
plan: "[[2026-10-29-supabase-keep-alive]]"
id: 02
unit: SABAY-51
status: todo
model: haiku
effort: low
depends_on: [01]
parallel_group: B
files:
  create: []
  modify: [vercel.json, docs/ops/uptime.md]
  delete: []
---
# 02 · Daily keep-alive cron + ops note

## Task
Add a daily Vercel cron that calls `/api/health`, and document it in the uptime runbook.

## Context
Repo root: `/home/apa/Code/carpool-calculator`.

Supabase free-tier projects pause after 7 days without API activity. `GET /api/health`
(`app/api/health/route.ts`) runs a service-role `settings` select, which counts as activity. Prompt 01 already
made it reachable without a session, so a Vercel cron can hit it.

**`vercel.json`** currently is exactly:
```json
{
  "crons": [
    {
      "path": "/api/push/send",
      "schedule": "0 0 * * 2"
    }
  ]
}
```
Append a second object to `crons` with the same 2-space formatting:
`{ "path": "/api/health", "schedule": "0 1 * * *" }`, written multi-line like the existing entry. Keep the
`/api/push/send` entry unchanged and first.

**`docs/ops/uptime.md`**: add a new `## Supabase keep-alive` section directly before `## Alert Channels`.
Keep it to about 8 lines, matching the doc's plain style (tables and short lists are fine). It must say:
- Why: Supabase free tier pauses a project after 7 days of inactivity. A paused project takes the whole app
  down until someone restores it by hand.
- What: the Vercel cron in `vercel.json` calls `GET /api/health` daily at `0 1 * * *` (01:00 UTC / 09:00 PHT).
  The route pings the DB with a `settings` select.
- That `/api/health` is deliberately public: it's exempt from the auth redirect in
  `lib/supabase/middleware.ts` and returns only status JSON.
- Verify: Vercel → Settings → Cron Jobs lists `/api/health` (use "Run" to trigger it once and expect 200), and
  Supabase → Logs → API shows the daily request.
- Limits: the cron runs only on the Production deployment (not staging or previews), and it can't wake a
  project that is already paused. Restore that from the Supabase dashboard.

## Do not
- Touch files outside the `files` list. If you must, stop and report why.
- Touch `CHANGELOG.md` or `TASKS.md`. That's bookkeeping, done outside the PR.
- Change the existing push cron or Monitor 1/2 tables.
- Add dependencies, abstractions or config that aren't listed here.
- Create or switch branches, commit, or push.

## Done when
```bash
node -e 'const c=require("./vercel.json").crons; if(c.length!==2||c[0].path!=="/api/push/send"||!c.some(x=>x.path==="/api/health"&&x.schedule==="0 1 * * *")) process.exit(1)'
npm run build
npm test
```
- `docs/ops/uptime.md` has a `## Supabase keep-alive` section before `## Alert Channels` that covers every
  bullet above.

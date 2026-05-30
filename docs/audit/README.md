# Audit artifacts

This directory holds inputs/outputs for the ongoing security + perf audit.

## CRUD perf baseline (`perf-baseline.json`)

`scripts/perf-probe.ts` runs a handful of read/write queries 10x each against
a Supabase project and reports median + p95 latency. Re-run it before and
after RLS/index changes to see if anything regressed.

### What it measures

- `SELECT * FROM trips WHERE group_id = $1 LIMIT 50`
- `SELECT * FROM fillups WHERE group_id = $1 LIMIT 50`
- `SELECT * FROM push_subscriptions WHERE user_id = $1`
- INSERT + DELETE round-trip on a throwaway `trips` row

### Running it

> **Do not run this against production.** Point it at a dev or preview branch
> with seeded data. The probe writes (and deletes) a `trips` row, and uses the
> service-role key so it bypasses RLS.

You must run this manually with your own credentials. CI does not run it.

1. Put credentials for the target project in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   ```
   (`SUPABASE_SECRET_KEY` also works.)

2. Pick a `group_id` and `user_id` that exist in that project. Any group and
   any user with push subscriptions will do; the probe only reads them.

3. Run:
   ```bash
   npx tsx scripts/perf-probe.ts <group_id> <user_id>
   ```

4. The script writes `docs/audit/perf-baseline.json` and prints a one-line
   summary per query. Commit the JSON if you want the baseline tracked.

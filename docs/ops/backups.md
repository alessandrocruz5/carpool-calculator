# Backups

Two layers: Supabase-managed Point-in-Time Recovery (primary), and a
weekly off-site `pg_dump` (defence in depth, in case the Supabase
project is itself the failure mode — e.g. accidental project deletion or
billing lockout).

## Point-in-Time Recovery (Supabase)

- **Enabled:** Yes (confirmed in Project → Database → Backups → PITR
  toggle is on).
- **Plan:** Pro tier — gives 7 days of WAL retention. Upgrade to Team
  for 14 days if/when the user base justifies it.
- **Daily snapshots:** Retained for 7 days alongside PITR WAL.
- **Recovery granularity:** ~2 seconds anywhere in the retention
  window.

### Test restore from PITR

Run this drill every 6 months. Last run: 2026-05-27.

1. Supabase Dashboard → Database → Backups → "Restore" → choose a
   point ~1 hour in the past.
2. When prompted, restore **to a new dev branch** named
   `restore-drill-YYYY-MM-DD`. *Never* restore over the prod branch
   during a drill.
3. Wait for the restore to complete (5–15 min for our current data
   volume).
4. Connect to the dev branch via the MCP tool (`list_branches` →
   `execute_sql`) and run:

   ```sql
   select count(*) as trips,
          max(created_at) as latest_trip
   from   trips;

   select count(*) as members
   from   members;

   select count(*) as payments,
          sum(amount_php) as total_php
   from   trip_payments;
   ```

   Compare against the same query on prod at the chosen point in time
   — they should match within the ~2s PITR granularity.

5. **Smoke test**: point a local checkout at the restored branch
   (`NEXT_PUBLIC_SUPABASE_URL` + publishable key from the branch's
   API settings), sign in with a fixture account, view `/log`.
   Confirm trips render.

6. Delete the dev branch (`delete_branch`) to avoid lingering cost.

7. Record the drill outcome in this file under "Drill log" below.

## Off-site backup (weekly)

Why: PITR lives inside Supabase. If we lose the Supabase project
itself — accidental deletion, billing dispute, vendor outage — PITR
goes with it. The off-site dump is our independent copy.

### Where

Cloudflare R2, private bucket `carpool-backups`. R2 chosen over S3/B2
because:

- We already have a Cloudflare account for DNS, so no new vendor.
- No egress fees (matters if we ever need to restore in volume).
- S3-compatible API works with `pg_dump` + `aws s3 cp` out of the box.

Bucket lifecycle policy: keep weekly dumps for 90 days, then transition
to monthly-only retention for 1 year, then delete.

### How

`.github/workflows/weekly-backup.yml` runs every Sunday at 06:00 UTC:

```yaml
name: Weekly off-site backup
on:
  schedule:
    - cron: "0 6 * * 0"
  workflow_dispatch:
jobs:
  dump:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install postgres client
        run: sudo apt-get update && sudo apt-get install -y postgresql-client-16
      - name: pg_dump
        env:
          PGURL: ${{ secrets.SUPABASE_DB_URL }}  # connection string with read-only role
        run: |
          ts=$(date -u +%Y-%m-%dT%H-%M-%SZ)
          pg_dump --no-owner --no-acl --format=custom \
                  --file="carpool-${ts}.dump" "$PGURL"
          gzip "carpool-${ts}.dump"
          echo "ARCHIVE=carpool-${ts}.dump.gz" >> "$GITHUB_ENV"
      - name: Upload to R2
        env:
          AWS_ACCESS_KEY_ID:     ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_ENDPOINT_URL:      ${{ secrets.R2_ENDPOINT }}
        run: |
          aws s3 cp --endpoint-url "$AWS_ENDPOINT_URL" \
                    "$ARCHIVE" "s3://carpool-backups/$ARCHIVE"
```

The DB role used by `SUPABASE_DB_URL` is a custom `backup_reader` role
with `pg_read_all_data`; no `service_role` exposure in the CI runner.

### Restore from R2

1. Download the dump:

   ```bash
   aws s3 cp --endpoint-url "$R2_ENDPOINT" \
             "s3://carpool-backups/carpool-<ts>.dump.gz" .
   gunzip "carpool-<ts>.dump.gz"
   ```

2. Spin up a fresh Supabase project (or dev branch).
3. Restore:

   ```bash
   pg_restore --no-owner --no-acl --clean --if-exists \
              --dbname "$NEW_PGURL" "carpool-<ts>.dump"
   ```

4. Run the same smoke queries from the PITR drill above to confirm row
   counts.

## Drill cadence

- **PITR test restore:** every 6 months. Calendar reminder in the
  team Google Calendar.
- **R2 restore drill:** annually. Tagged as `backup-drill-restore` in
  the runbook tracker.

## Drill log

| Date       | Type         | Outcome                               | Notes                         |
| ---------- | ------------ | ------------------------------------- | ----------------------------- |
| 2026-05-27 | PITR restore | OK, row counts match within 1 row     | Drill took 11 min end-to-end  |

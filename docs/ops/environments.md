# Environments

Three-tier setup so we can ship without breaking prod.

## Tiers

| Tier       | Git branch     | Vercel target          | Supabase target                                      |
| ---------- | -------------- | ---------------------- | ---------------------------------------------------- |
| Production | `main`         | Production deployment  | Prod project (default branch)                        |
| Staging    | `staging`      | Custom env "Staging"   | Dev branch named `staging` on the prod project       |
| Preview    | PR branches    | Preview deployment     | Ephemeral dev branch per PR (see sprint 5.6)         |

Preview branches are created/destroyed by the PR-branch workflow described in
`docs/ops/previews.md`. Staging is a long-lived dev branch — it persists
across deploys and gets the same migrations as prod but with seeded fixture
data instead of real user data.

## Env var matrix

`✓` = set on this tier. `prod` = pulled from prod secret. `dev` = pulled from
the matching dev-branch secret. `shared` = same value across tiers.

| Variable                              | Production | Staging | Preview | Notes                                                                 |
| ------------------------------------- | ---------- | ------- | ------- | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`            | prod       | dev     | dev     | URL flips per Supabase branch                                         |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`| prod       | dev     | dev     | `sb_publishable_*`                                                    |
| `SUPABASE_SERVICE_ROLE_KEY`           | prod       | dev     | dev     | `sb_secret_*`, server-only                                            |
| `NEXT_PUBLIC_SITE_URL`                | ✓          | ✓       | auto    | Preview uses Vercel's `VERCEL_URL`                                    |
| `VAPID_PUBLIC_KEY`                    | shared     | shared  | shared  | Same keypair across tiers; subscriptions are per-user                 |
| `VAPID_PRIVATE_KEY`                   | shared     | shared  | shared  | Server-only                                                           |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL`        | prod       | dev     | —       | Previews don't write to Sheets                                        |
| `GOOGLE_PRIVATE_KEY`                  | prod       | dev     | —       | PEM, newlines escaped                                                 |
| `SENTRY_DSN`                          | prod       | staging | preview | Separate projects so error rates stay readable                        |
| `SENTRY_AUTH_TOKEN`                   | shared     | shared  | shared  | For source-map upload at build time                                   |
| `UPSTASH_REDIS_REST_URL`              | prod       | dev     | dev     | Rate-limit store                                                      |
| `UPSTASH_REDIS_REST_TOKEN`            | prod       | dev     | dev     |                                                                       |
| `CRON_SECRET`                         | prod       | dev     | —       | Shared secret for `/api/cron/*` endpoints                             |

Vercel scopes env vars by Production / Preview / Development. Staging uses
the **Preview** scope with a `VERCEL_ENV=preview` check plus a custom
`APP_ENV=staging` flag on the `staging` branch's deployment.

## Promotion flow

```
feature branch ──► PR ──► preview deploy + ephemeral Supabase branch
                    │
                    ▼
              review + CI green
                    │
                    ▼
            merge into `staging` ──► staging deploy
                    │
                    ▼
              smoke test on staging
                    │
                    ▼
            merge `staging` into `main` ──► production deploy
```

### Smoke test on staging

After every merge into `staging`, run the smoke checklist (kept in
`e2e/smoke.spec.ts`) against `https://staging.carpool.example`:

1. Sign in with the staging fixture account.
2. Create a trip, mark a passenger paid, confirm payment row appears in
   `/payments`.
3. Trigger a push notification from `/admin` and confirm receipt.
4. Open `/account/export` and confirm the download works.

Only merge to `main` once smoke passes. The `staging`→`main` merge should
be a fast-forward — any conflicts mean someone hot-fixed prod and the fix
needs to be cherry-picked back into `staging` first.

## Rollback

- **Vercel:** "Promote" a previous production deployment from the
  Deployments tab. Takes effect in seconds.
- **Supabase schema:** Revert the offending migration with a new
  `down`-style migration; never edit a committed migration in place.
- **Data:** Use PITR (see `docs/ops/backups.md`).

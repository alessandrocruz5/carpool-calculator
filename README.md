# Carpool Calculator

A PWA for splitting carpool costs per leg (morning/evening) with a driver-favored ratio.

## Split scheme

- 1 passenger: 40 driver / 60 passenger
- 2 passengers: 25 driver / 75 (37.5 each)
- 3 passengers: 19 driver / 81 (27 each)

Calculated per leg, so partial-day ridership (someone misses morning or evening) is handled correctly.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres + Auth, optional in v1) · `@ducanh2912/next-pwa` · `google-spreadsheet` · Zustand (localStorage persistence)

## Setup

```bash
npm install
cp .env.example .env.local   # fill in Supabase + Google creds
npm run dev                  # http://localhost:3000
npm test                     # vitest unit tests
npm run build                # production build
```

## Supabase

Apply the migrations in `supabase/migrations/` to your project in numeric order. The multi-tenant model is layered on across `0005`–`0009`:

- **`0005_groups_profiles_cars.sql`** — introduces `groups`, `profiles` (auto-created per `auth.users` row), and `cars` (per-user vehicles with `fuel_efficiency_kml` and `tank_size_liters`).
- **`0006_multitenancy_columns.sql`** — adds `group_id` to every data table, `car_id` + `driver_user_id` to `trips`, restructures `members` and `settings` to be group-scoped, creates `member_invites` for pending invitees, and backfills legacy rows into a "Legacy Carpool" group owned by the first existing driver.
- **`0007_rls_group_scoped.sql`** — drops the flat policies from `0003` and replaces them with `is_group_member(gid)` / `is_group_driver(gid)` security-definer helpers plus group-scoped RLS on every table. From here on, two users in different groups cannot see each other's trips, passengers, settings, fillups, or payments.
- **`0008_group_rpcs.sql`** — exposes `create_group(name)`, `link_member_by_email(group_id, email, role)`, and friends. `create_group` adds the caller as `role='both'` and seeds default `settings`.
- **`0009_fillups_owner.sql`** — stamps `owner_user_id` onto every fillup so per-driver mileage rollups stay correct after a car changes hands.

Env vars use the current Supabase 2025 key format:

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ← Supabase **publishable key** (`sb_publishable_…`)
- `SUPABASE_SERVICE_ROLE_KEY` ← Supabase **secret key** (`sb_secret_…`)

Both are in **Project Settings → API Keys** in the Supabase dashboard.

## Deploy to Vercel

1. **Create the Supabase project.** In the Supabase dashboard, create a new project. Wait for it to provision.
2. **Apply the schema.** Open **SQL Editor** and run each migration in `supabase/migrations/` in order: `0001_init.sql`, `0002_trip_payments.sql`, `0003_members_and_rls.sql`, `0004_push_subscriptions.sql`. Open **Table Editor** and confirm these tables exist: `passengers`, `gas_prices`, `fillups`, `settings`, `trips`, `trip_legs`, `trip_leg_riders`, `trip_payments`, `members`, `push_subscriptions`. The `settings` table should already contain one row with `id = 1`.
3. **Copy the keys.** Go to **Project Settings → API Keys** and copy:
   - the project URL (top of the page)
   - the **publishable key** (`sb_publishable_…`)
   - the **secret key** (`sb_secret_…`) — click "Reveal"
4. **Import to Vercel.** In Vercel, **Add New Project → Import** this GitHub repo. Before the first deploy, add these environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = publishable key
   - `SUPABASE_SERVICE_ROLE_KEY` = secret key
   - (optional) `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID` for Sheets export. Leave unset to disable that feature cleanly.
5. **Deploy.** Vercel auto-detects Next.js. After deploy, open the URL, go to `/settings`, add a passenger, and confirm the row appears in the Supabase **Table Editor**. If it does, every other store is wired the same way.
6. **Create the first group.** The app is invite-only: every data table is gated by `is_group_member(gid)`, so a brand-new auth user can't see (or be seen) until they belong to a group. Signup is self-serve — no SQL Editor step needed:
   1. Have the first user sign in once via the magic link on `/auth/login`. The `handle_new_user` trigger creates their empty profile row.
   2. On `/groups`, that user creates a group by name. This calls the `create_group` RPC, which inserts the group, adds the caller as `role = 'both'`, and seeds a default `settings` row in one shot.
   3. From `/admin/members`, invite everyone else by email. Pick `driver` (can edit shared settings, manage trips/fillups), `passenger` (read-only on shared data, can mark their own payments), or `both`. If the invitee already has an auth user, they're added immediately; otherwise a row in `member_invites` is created and consumed the next time they sign in with that email.

The full /admin/members surface (and the underlying `link_member_by_email` RPC) is the only way to add a second user — RLS does not allow self-joining a group. **Invite-only is preserved end-to-end.**

## Launch configuration (production SMTP, CAPTCHA, leaked-password protection)

Before opening the app to public self-serve signup, walk through
[`docs/ops/launch-config.md`](docs/ops/launch-config.md) — it covers
production SMTP (custom domain + SPF/DKIM), Supabase's leaked-password
protection toggle, and Cloudflare Turnstile setup for CAPTCHA on sign-in,
including the required deploy-before-toggle sequencing.

## Google Sheets export

Optional. Create a service account, share the target spreadsheet with its email, and set `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID`. Trigger from the Week page → exports one tab per month, one row per leg. When any of those vars is unset, `/api/sheets/export` returns 503 and the export button on `/week` renders disabled.

## Per-car mileage workflow

Each driver can register one or more cars under **Account → Cars**. Every car has its own `fuel_efficiency_kml` (optional manual override) and `tank_size_liters`.

- **Fillups** belong to a specific car (`fillups.car_id`) and are also stamped with `owner_user_id` so a car changing hands doesn't corrupt history.
- **Trips** pick the driver's car at log time (`trips.car_id`, `trips.driver_user_id`). The Trip Editor defaults to the signed-in driver's most-recently-used car.
- **Rolling mileage** is computed **per car**: `getRollingMileage(fillups, carId)` averages km / liter across that car's fillups only. The settings-level "Mileage override" still wins when set, but otherwise each car uses its own rolling number.
- When a driver has no fillups yet for a car, the trip cost calculation falls back to the group-level `mileageKmPerL` setting.

## Tests

```bash
npm test           # unit + route tests via vitest
npm run e2e        # Playwright E2E (see e2e/README.md)
```

The RLS regression suite in `lib/test/rls.integration.test.ts` runs end-to-end against a Supabase **dev branch**. It is skipped unless these env vars are set when invoking `npm test`:

- `RLS_TEST_SUPABASE_URL` — dev branch project URL
- `RLS_TEST_SERVICE_ROLE_KEY` — service-role key (used to seed users + rows directly)
- `RLS_TEST_ANON_KEY` (or `RLS_TEST_PUBLISHABLE_KEY`) — the publishable key, used to sign in as each seeded user

The suite seeds two groups with disjoint owners and asserts that user A's PostgREST `select` against `trips`, `passengers`, `settings`, `fillups`, and `trip_payments` cannot leak rows belonging to user B's group (and vice versa).

### Running RLS tests in CI

The `rls-integration` job in `.github/workflows/ci.yml` runs the suite against a Supabase dev branch. To turn it on:

1. In the Supabase dashboard, create a dev branch dedicated to CI (e.g. `ci-rls`).
2. In GitHub → repo **Settings → Secrets and variables → Actions**, add:
   - `RLS_TEST_SUPABASE_URL` — the dev branch project URL
   - `RLS_TEST_SERVICE_ROLE_KEY` — the dev branch secret key (`sb_secret_…`)
   - `RLS_TEST_ANON_KEY` — the dev branch publishable key (`sb_publishable_…`)
3. The job runs automatically on push to `main`. To run it on a PR, add the `run-rls-tests` label — this keeps the dev branch free from per-PR burn.

### CI status checks required for merge

Configure these as required status checks in GitHub → repo **Settings → Branches → `main`**:

- `lint-and-typecheck` — `npm run lint` + `tsc --noEmit`
- `test` — vitest unit + route tests
- `e2e` — Playwright golden path (PRs only)

Optional (run on demand or on push to `main`):

- `rls-integration` — gated by the `run-rls-tests` label on PRs

## Analytics

The app uses [Vercel Analytics](https://vercel.com/docs/analytics) and [Vercel Speed Insights](https://vercel.com/docs/speed-insights) for privacy-friendly page-view and Core Web Vitals tracking. Both are wired in via `<Analytics />` and `<SpeedInsights />` in `app/layout.tsx`.

- No cookies are set, so no cookie banner is required.
- Visitor IP addresses are hashed daily and never stored long-term, so the data is anonymous (GDPR/CCPA-friendly).
- Data is only collected on production deployments (the script auto-detects `NODE_ENV` and is a no-op locally / in test builds).
- **Do Not Track**: `@vercel/analytics` v2 does not bake in a client-side DNT check, but since it collects no cookies, no `localStorage`/`sessionStorage`, no persistent visitor IDs, and no raw IPs, it is considered privacy-friendly by default. Visitors who want a hard opt-out can install any tracker-blocker (uBlock Origin, Brave Shields, etc.); the `/_vercel/insights/*` endpoints are on the common blocklists.

Enable Analytics and Speed Insights in the Vercel dashboard for the project; no additional env vars are required.

## Notes

- Gas price: manual entry every Tuesday (no Petron/DOE API)
- Toll prices: Skyway 164 / SLEX 124 per leg, editable in Settings
- Mileage: rolling avg from per-car fill-up log, with manual per-group override

# Carpool Calculator

A PWA for splitting carpool costs per leg (morning/evening) with a driver-favored ratio. Built for the Mt. McDo ↔ office run.

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

Apply `supabase/migrations/0001_init.sql` to your project. RLS is permissive in v1 (shared tracker among trusted coworkers). Tighten policies + flip `NEXT_PUBLIC_REQUIRE_AUTH=true` before going public.

Env vars use the legacy names but accept the current Supabase 2025 key format:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ← Supabase **publishable key** (`sb_publishable_…`)
- `SUPABASE_SERVICE_ROLE_KEY` ← Supabase **secret key** (`sb_secret_…`)

Both are in **Project Settings → API Keys** in the Supabase dashboard.

## Deploy to Vercel

1. **Create the Supabase project.** In the Supabase dashboard, create a new project. Wait for it to provision.
2. **Apply the schema.** Open **SQL Editor**, paste the contents of `supabase/migrations/0001_init.sql`, run. Open **Table Editor** and confirm 7 tables exist: `passengers`, `gas_prices`, `fillups`, `settings`, `trips`, `trip_legs`, `trip_leg_riders`. The `settings` table should already contain one row with `id = 1`.
3. **Copy the keys.** Go to **Project Settings → API Keys** and copy:
   - the project URL (top of the page)
   - the **publishable key** (`sb_publishable_…`)
   - the **secret key** (`sb_secret_…`) — click "Reveal"
4. **Import to Vercel.** In Vercel, **Add New Project → Import** this GitHub repo. Before the first deploy, add these environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = publishable key
   - `SUPABASE_SERVICE_ROLE_KEY` = secret key
   - (optional) `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID` for Sheets export. Leave unset to disable that feature cleanly.
5. **Deploy.** Vercel auto-detects Next.js. After deploy, open the URL, go to `/settings`, add a passenger, and confirm the row appears in the Supabase **Table Editor**. If it does, every other store is wired the same way.

Note: RLS is `USING (true)` in v1, so anyone who learns the project URL + publishable key can read/write everything. Keep the GitHub repo private, don't share the deployed URL, and don't paste the keys into any client-side code outside this project.

## Google Sheets export

Optional. Create a service account, share the target spreadsheet with its email, and set `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID`. Trigger from the Week page → exports one tab per month, one row per leg. When any of those vars is unset, `/api/sheets/export` returns 503 and the export button on `/week` renders disabled.

## Notes

- Gas price: manual entry every Tuesday (no Petron/DOE API)
- Toll prices: Skyway 164 / SLEX 124 per leg, editable in Settings
- Mileage: rolling avg from fill-up log, with manual override

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

## Google Sheets export

Create a service account, share the target spreadsheet with its email, and set `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID`. Trigger from the Week page → exports one tab per month, one row per leg.

## Notes

- Gas price: manual entry every Tuesday (no Petron/DOE API)
- Toll prices: Skyway 164 / SLEX 124 per leg, editable in Settings
- Mileage: rolling avg from fill-up log, with manual override

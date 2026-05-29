# Client-side data-fetching audit

_Generated 2026-05-29 against commit `bd8f6a3` (branch `claude/inspiring-euler-kz3Oe`)._
_Next.js 14.2.35, App Router, Supabase (SSR + browser clients), Zustand stores._

This audit maps where and how the app fetches data on the navigation hot path,
to find what blocks first paint. **No code was changed.** Fixes are tracked in a
follow-up task; see "Top recommendations" at the bottom for the ranked shortlist.

---

## TL;DR architecture

Almost every user-facing page (`/`, `/log`, `/payments`, `/settings`, `/gas`,
`/cars`, `/groups`) is a **`'use client'` component**. None of them render any
data on the server. Instead:

```
Page (client)  ──mount──▶ Zustand store.hydrate()  ──▶ fetch('/api/...')  ──▶ route handler ──▶ supabase
```

Store hydration is kicked off centrally from `components/HydrateStores.tsx`
(mounted in `app/layout.tsx`) and `lib/store/groupScope.ts`, both inside
`useEffect`. **This means the data round-trip only starts after the JS bundle
has downloaded, parsed, and hydrated on the client** — the classic client-side
waterfall. The server sends an empty shell; the user stares at skeletons until
the API call returns.

This is the single biggest navigation-slowness driver, and it frames every
finding below.

---

## 1. `'use client'` components that call `supabase.from(...)` directly

**Finding: none.** No client component calls `supabase.from(...)` directly.
Direct table access is confined to server route handlers (`app/api/**/route.ts`)
and Server Components (admin pages). This is good hygiene.

Client components only touch Supabase for **auth**, not table reads:

| File:line | Call | Notes |
|---|---|---|
| `app/auth/login/LoginForm.tsx:44-45` | `createClient().auth.signInWithPassword(...)` | interactive, fine on client |
| `app/account/AccountForm.tsx:18-19` | `createClient().auth.getUser()` | could be passed from server |
| `app/account/AccountForm.tsx:39-40` | `createClient().auth.updateUser(...)` | interactive, fine |
| `app/account/AccountForm.tsx:232` | `createClient().auth.signOut()` | interactive, fine |
| `app/page.tsx:68` | `createClient().auth.getClaims()` | in `useEffect`; adds a client round-trip to fetch the user id that the server already knows |

**However**, the equivalent anti-pattern is present one layer down: client pages
fetch the *same data* via `fetch('/api/...')` in store `hydrate()` actions. The
relevant blocking fetches are:

| Store (action) | Endpoint(s) | Hydrated from |
|---|---|---|
| `lib/store/settings.ts:25-27` | `/api/settings` + `/api/gas-prices` (already `Promise.all`'d ✅) | `groupScope` |
| `lib/store/payments.ts:33` | `/api/payments` | `groupScope` |
| `lib/store/groups.ts:31` | `/api/groups` | `HydrateStores` |
| `lib/store/fillups.ts:22` | `/api/fillups` | `groupScope` |
| `lib/store/roster.ts` | `/api/passengers` | `groupScope` |
| `lib/store/trips.ts` | `/api/trips` | `groupScope` |
| `lib/store/members.ts` | `/api/members` | `groupScope` |
| `lib/store/profile.ts` | `/api/profile` | `HydrateStores` |

All of these block the first meaningful paint of the page that depends on them.

---

## 2. Routes doing sequential awaits where `Promise.all` would work

The GET handlers on the hot path are mostly single-query and fine. The notable
offenders are multi-query handlers that await serially:

### 2a. `app/api/account/export/route.ts` — **worst offender** (13 sequential awaits)
After resolving `userId`, the following queries are **independent** and could run
in one `Promise.all` (currently lines ~30-46):
- `getUserById(userId)` (line 30)
- `profiles` where `user_id` (line 34)
- `members` where `user_id` (line 40)
- `cars` where `owner_user_id` (line 56)
- `fillups` where `owner_user_id` (line 62)
- `trips` where `driver_user_id` (line 68)

Then a **second** parallel batch (depends only on the ids derived above):
- `trip_legs` in `drivenTripIds` (line 74)
- `trip_leg_riders` in `passengerIds` (line 81)
- `trip_payments` (rider) (line 89)
- `trip_payments` (driver) (line 96)
- `groups` in `groupIds` (line 118)

~11 serial round-trips → **2 batches**. Not on the nav path (it's a download),
but a clear, safe win.

### 2b. `app/api/trips/route.ts` POST (24 awaits)
Lines ~66-83: the `members` role lookup and the `cars` ownership lookup are
independent and could be `Promise.all`'d. Mutation path, lower priority.

### 2c. Duplicate auth round-trips in every mutating handler
`requireActiveGroupId(supabase)` (which calls `auth.getClaims()` + a `members`
query) is immediately followed by `requireGroupDriver(supabase, groupId)` (which
calls `auth.getClaims()` **again** + another `members` query). Seen in
`app/api/members/route.ts:31-35`, `app/api/trips/route.ts:48-51`,
`app/api/passengers/route.ts`, `app/api/fillups/route.ts`, etc. Each mutation
pays for 2× `getClaims` and 2× `members` SELECT that could be a single lookup.

### Routes that are already clean
- `app/api/trips/route.ts` GET — already `Promise.all([trips, gas_prices])` ✅
- `app/api/disputes/route.ts`, `app/api/push/send/route.ts` — use `Promise.all` ✅
- `app/api/cars`, `app/api/members`, `app/api/payments`, `app/api/settings` GET — single query each, nothing to parallelize.

---

## 3. Pages without `revalidate`/cache hints that could use ISR or `cache()`

Every route handler is `export const dynamic = "force-dynamic"` and every store
`fetch` uses `{ cache: "no-store" }`. Nothing is cached anywhere. Candidates:

| Surface | Current | Opportunity |
|---|---|---|
| All `/api/*` GET handlers | `force-dynamic`, `no-store` | Per-request memoization with React `cache()` for the repeated `getActiveGroupId` / `auth.getClaims` / `members` lookups (called by nearly every handler on a single request). |
| `getActiveGroupId` (`lib/group.ts`) | re-runs `getClaims` + `members` query every call | Wrap in React `cache()` so multiple handlers/components in one request share one result. **Highest-frequency duplicate query in the app.** |
| `app/changelog/page.tsx`, `app/legal/*`, `app/install/page.tsx` | dynamic by default | Static content — could be statically rendered / `revalidate`'d. Low traffic, low impact. |
| Server pages `app/admin/*`, `app/account/page.tsx` | Server Components, no cache hints | Could add `unstable_cache` around slow admin reads, but admin is low-traffic. |

There is **no SWR / React Query / `unstable_cache` / React `cache()` usage
anywhere** in the codebase (confirmed by grep). All caching is the Zustand
in-memory store + IndexedDB persistence.

---

## 4. Components that re-fetch the same data on every render

No component fetches inside the render body or in an effect that runs on every
render — hydration effects use `[]` or `[activeGroupId]` deps, so they fire once
per mount / group switch. Specifics:

- `components/HydrateStores.tsx:12` — `useEffect(..., [])` ✅ once.
- `components/HydrateStores.tsx:20` — `useEffect(..., [activeGroupId])` — refetches **all six** group-scoped stores on every group switch (`lib/store/groupScope.ts` `applyGroupScope`). Correct, but heavy: one switch = 6 parallel API calls.
- `app/log/page.tsx:31-47` — `fetch('/api/sheets/export')` in `useEffect(..., [])` ✅ once per mount, but re-runs on every navigation **to** `/log` because there's no cross-navigation cache (no SWR). A `cache()`/SWR layer would dedupe.
- `app/log/page.tsx:49` — ESLint flags `liveSettings` recreated every render, churning a downstream `useMemo` (line 73). Not a fetch, but a render-perf smell on a 433-line client page.

Because there's no SWR/React Query, **every navigation re-mounts the page and
re-fetches** (the store keeps in-memory data so it's often warm, but a hard
navigation / reload pays full cost, and `/api/sheets/export` has no store at all
so it always refetches).

---

## 5. Bundle size (`next build` output)

Build succeeded (`npm run build`, Next 14.2.35). Full output captured below.

**No route-specific chunk exceeds 200 KB** — the largest route-specific JS is
`/settings` at 10.7 kB. **However, several routes exceed 200 KB First Load JS**,
driven by the **157 KB shared baseline** (`chunks/256` 99.6 kB + the
`fd9d1056` framework chunk 53.8 kB):

| Route | Route JS | **First Load JS** | Flag |
|---|---|---|---|
| `/` | 6.36 kB | **239 kB** | ⚠️ > 200 KB |
| `/log` | 5.11 kB | **238 kB** | ⚠️ > 200 KB |
| `/payments` | 3.05 kB | **236 kB** | ⚠️ > 200 KB |
| `/account` | 4.09 kB | **226 kB** | ⚠️ > 200 KB |
| `/auth/login` | 2 kB | **226 kB** | ⚠️ > 200 KB |
| `/settings` | 10.7 kB | 170 kB | ok |
| `/admin` | 7.28 kB | 169 kB | ok |
| `/cars/[carId]` | 6.8 kB | 168 kB | ok |
| `/cars` | 4.09 kB | 166 kB | ok |
| `/gas` | 6.67 kB | 163 kB | ok |
| `/groups` | 2.97 kB | 162 kB | ok |
| shared by all | — | 157 kB | baseline |
| Middleware | — | 151 kB | heavy (Supabase SSR + Sentry) |

Notes:
- The 157 KB shared baseline is the real lever — every route pays it. Likely
  contributors: `@supabase/supabase-js`, `@sentry/nextjs`, `dayjs`, `zustand`.
  The `/` (239 KB) page additionally imports **seven** stores + `createClient`
  + `dayjs` + calc/mileage helpers (`app/page.tsx:6-21`).
- `/` could shed the `@supabase/supabase-js` browser client from its bundle by
  not calling `createClient().auth.getClaims()` on the client (`app/page.tsx:68`)
  — the user id is already available server-side.
- Middleware is 151 KB (runs on every request) because it pulls in the full
  Supabase SSR client; worth a separate look.

<details>
<summary>Raw <code>next build</code> route table</summary>

```
Route (app)                              Size     First Load JS
┌ ƒ /                                    6.36 kB         239 kB
├ ƒ /_not-found                          1.03 kB         158 kB
├ ƒ /account                             4.09 kB         226 kB
├ ƒ /admin                               7.28 kB         169 kB
├ ƒ /admin/audit                         330 B           157 kB
├ ƒ /admin/members                       1.75 kB         158 kB
├ ƒ /auth/error                          358 B           159 kB
├ ƒ /auth/login                          2 kB            226 kB
├ ƒ /cars                                4.09 kB         166 kB
├ ƒ /cars/[carId]                        6.8 kB          168 kB
├ ƒ /changelog                           331 B           157 kB
├ ƒ /gas                                 6.67 kB         163 kB
├ ƒ /groups                              2.97 kB         162 kB
├ ƒ /install                             1.08 kB         158 kB
├ ƒ /legal/contact                       358 B           159 kB
├ ƒ /legal/privacy                       359 B           159 kB
├ ƒ /legal/terms                         358 B           159 kB
├ ƒ /log                                 5.11 kB         238 kB
├ ƒ /payments                            3.05 kB         236 kB
└ ƒ /settings                            10.7 kB         170 kB
+ First Load JS shared by all            157 kB
  ├ chunks/256-8c8bc286495fd806.js       99.6 kB
  ├ chunks/fd9d1056-aae2aa0d90d464cc.js  53.8 kB
  └ other shared chunks (total)          3.15 kB

ƒ Middleware                             151 kB
```
(API routes omitted — all 0 B client JS.)
</details>

---

## Top recommendations (ranked by user-visible navigation win)

1. **Kill the client-fetch waterfall on the highest-traffic pages.** Convert
   `/log` and `/payments` (read-heavy, mostly display) so the server fetches the
   data and either renders it directly or seeds the Zustand store, instead of an
   empty shell + `useEffect` fetch. Biggest first-paint win.
2. **Memoize the per-request auth/group resolution with React `cache()`.**
   `getActiveGroupId` (`lib/group.ts`) does `getClaims` + a `members` query and is
   called by nearly every handler; mutating handlers do it twice. `cache()`
   collapses duplicates within a request at near-zero risk.
3. **Parallelize `app/api/account/export/route.ts`** into two `Promise.all`
   batches (~11 serial round-trips → 2). Self-contained, safe, easy to verify.
4. Remove `createClient().auth.getClaims()` from `app/page.tsx:68` (pass user id
   from a server boundary) to drop the Supabase browser client from the heaviest
   (239 KB) route.
5. Investigate the 157 KB shared baseline / 151 KB middleware (Sentry + Supabase
   SSR) for a global First-Load reduction.

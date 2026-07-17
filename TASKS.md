# Carpool Calculator — Sprints
Status: [ ] planned · [~] in progress · [x] merged · [-] cancelled (excluded from changelog)

## Sprint 7 — Public self-serve launch hardening   (planned 2026-07-17)
Epic: SABAY-41 · base branch: `main` · target version: v2.2.0 (MINOR)

Go-live gaps for opening the app to public self-serve signup (self-serve group creation +
onboarding already ship). Two items are Supabase-dashboard config with no code diff (production
SMTP, leaked-password protection) and land in a runbook unit; two have real code (CAPTCHA on auth,
public landing page at `/`). No migrations, no schema, no money flow — the only high-stakes surface
is auth (middleware redirect logic + CAPTCHA on sign-in), so SABAY-43/44 carry a code-guardian gate.
Ships as v2.2.0 (MINOR) when all units merge. **Key sequencing risk:** enabling the Supabase CAPTCHA
toggle before SABAY-43 ships token-sending breaks ALL sign-ins — deploy SABAY-43, *then* flip the
toggle, then verify (documented in SABAY-42). Magic-link route is already rate-limited 3/hr/email.

- [ ] SABAY-42 — Launch-config runbook + brand generalization · Added/Changed · files: docs/ops/launch-config.md (new), app/manifest.ts, .env.example, README.md · depends: — · build: Sonnet 5 · thinking on (brief) · effort medium
- [ ] SABAY-43 — CAPTCHA on the sign-in surface · Added/Changed · files: app/auth/login/LoginForm.tsx, app/api/auth/magic-link/route.ts (+test), .env.example, components/Turnstile.tsx (new) · depends: SABAY-42 · high-stakes (auth → code-guardian) · build: Opus 4.8 · thinking on (high) · effort high
- [ ] SABAY-44 — Public landing page at `/` · Added · files: app/page.tsx, lib/supabase/middleware.ts, app/layout.tsx, components (landing) · depends: — · high-stakes (auth-gating middleware → code-guardian) · build: Opus 4.8 · thinking on (high) · effort high

## Sprint 6 — Per-leg editable toll   (planned 2026-07-07)
Epic: SABAY-37 · base branch: `develop` · target version: v2.1.0 (MINOR)

Toll is currently a fixed amount keyed to the route enum (skyway/slex) with a single value per
expressway in group `settings`, so a trip that takes a different exit on the same expressway is over-
or undercharged. Make the toll an editable per-leg amount that pre-fills from the route default and
can be overridden, persisted on `trip_legs.toll_php` (nullable = use route default → zero backfill,
existing trips unchanged). `calcLeg` becomes `input.tollPhp ?? (route → settings)`. Units 1/2 carry
migration/money → code-guardian gate. Each unit line tags its build config (model · thinking · effort).

- [x] SABAY-38 — Migration + DB type: trip_legs.toll_php (nullable) · Added · files: supabase/migrations/<new>.sql, lib/supabase/types.ts · depends: — · guardian (migration) · build: Opus 4.8 · thinking on (medium) · effort medium (merged 2026-07-07, PR #177)
- [x] SABAY-39 — Thread per-leg toll through calc, persistence & export · Changed · files: lib/calc.ts, lib/calc.test.ts, app/api/trips/route.ts, lib/supabase/mappers.ts, lib/store/trips.ts, app/api/sheets/export/route.ts · depends: SABAY-38 · high-stakes (money → code-guardian) · build: Opus 4.8 · thinking on (high) · effort high (merged 2026-07-07, PR #178)
- [x] SABAY-40 — UI: editable toll field on the leg card · Changed · files: components/LegCard.tsx, app/page.tsx, (opt.) app/settings/page.tsx · depends: SABAY-39 · build: Sonnet 4.6 · thinking on (brief) · effort medium (merged 2026-07-07, PR #179)

## Sprint 5 — Go-live hardening + payment confirmation   (planned 2026-06-19 · released v2.0.0 2026-06-21)
Epic: SABAY-27 · base branch: `develop` · target version: v2.0.0 (go-live, MAJOR)

Launch-readiness sprint. (a) Invite overhaul: case-insensitive email matching in
`link_member_by_email`/`claim_member_invite` (the exact-case bug that silently strands mixed-case
invites), plus Option 2 — passenger rows are created at invite time with an explicit "Pending invite"
placeholder that self-heals to the profile name on first sign-in (no more email-local-part guessing).
(b) Security surface: rate-limit sweep on the ~11 unprotected write/expensive routes; remove the
Sentry example scaffolding. (c) Money correctness: largest-remainder allocation so splits foot exactly.
(d) Payment-confirmation handshake: passenger marks "I paid" → driver sees "Confirm"; a claim
unconfirmed within 24h expires and the passenger re-marks; web-push on claim/confirm. Units 1/5/6/7
carry migration/auth/money → code-guardian gate. Each unit line tags its build config
(model · thinking · effort) for token optimization.

- [x] SABAY-28 — Invite overhaul: case-insensitive email + self-healing placeholder · Fixed/Changed · files: supabase/migrations/<new>.sql, app/api/members/route.ts (+test) · depends: — · high-stakes (migration+auth → code-guardian) · build: Opus 4.8 · thinking on (high) · effort high (merged 2026-06-20, PR #165) — case-insensitive `lower()` matching in `link_member_by_email`/`claim_member_invite`; placeholder passenger "Pending invite" created at invite time and self-healed to `display_name` on first sign-in via a `profiles` trigger. Downstream: SABAY-29 removes "Not now" dismiss from NamePrompt; the trigger ensures the linked passenger row updates when the name is saved.
- [x] SABAY-29 — Mandatory name on first run · Changed · files: components/NamePrompt.tsx, app/page.tsx · depends: SABAY-28 · build: Sonnet 4.6 · thinking on (brief) · effort medium · (merged 2026-06-20, PR #166)
- [x] SABAY-30 — Rate-limit sweep on unprotected write/expensive routes · Changed · files: app/api/payments|settings|cars|fillups|gas-prices|passengers|account/delete|account/export|admin/archive-trips|disputes/[id]|groups/switch route.ts (+tests) · depends: — · guardian (auth surface) · build: Sonnet 4.6 · thinking on (brief) · effort medium · (merged 2026-06-20, PR #167)
- [x] SABAY-31 — Remove Sentry example scaffolding · Fixed · files: app/sentry-example-page/, app/api/sentry-example-api/ (delete) · depends: — · build: Haiku 4.5 · thinking off · effort low · (merged 2026-06-20, PR #168)
- [x] SABAY-32 — Penny-accurate split allocation · Fixed · files: lib/calc.ts, lib/calc.test.ts · depends: — · high-stakes (money → code-guardian) · build: Opus 4.8 · thinking on (high) · effort high · (merged 2026-06-20, PR #169)
- [x] SABAY-33 — Payment confirmation: schema + RLS · Added · files: supabase/migrations/<new>.sql, lib/supabase/types.ts · depends: — · high-stakes (migration+money+auth → code-guardian) · build: Opus 4.8 · thinking on (high) · effort high · (merged 2026-06-21, PR #170)
- [x] SABAY-34 — Payment confirmation: API (claim/confirm/24h expiry) · Added · files: app/api/payments/route.ts (+test), lib/store/payments.ts (+test) · depends: SABAY-33 · high-stakes (money+auth → code-guardian) · build: Opus 4.8 · thinking on (high) · effort high · (merged 2026-06-20, PR #171)
- [x] SABAY-35 — Payment confirmation: UI · Added · files: app/payments/page.tsx · depends: SABAY-34 · build: Sonnet 4.6 · thinking on (brief) · effort medium · (merged 2026-06-20, PR #172)
- [x] SABAY-36 — Payment notifications · Added · files: app/api/payments/route.ts, lib/push.ts · depends: SABAY-35 · guardian (notify surface) · build: Sonnet 4.6 · thinking on (brief) · effort medium · (merged 2026-06-20, PR #173)

## Sprint 4 — Variable trip legs (N ordered legs)   (planned 2026-06-18 · released v1.9.0 2026-06-18)
Epic: SABAY-22 · base branch: `develop` · target version: v1.9.0

Generalize the Trip page from a fixed two-leg (morning/evening) model to an ordered list of N legs
with a +/− control, defaulting to 2 and allowing a minimum of 1. Each leg follows the same per-leg
cost split and sums into the day total; parking applies to the **first** leg only. Shipped as an
expand→contract sequence (migration → calc → data layer → UI) so each PR stays independently green
under strict TS + CI typecheck. Every unit flows into `trip_payments` → units 23–25 carry a
code-guardian gate. Leg labels become "Leg N" (deliberate UX shift per Design B). No money backfill —
legacy 2-leg trips compute identically.

- [x] SABAY-23 — Migration: ordered N-leg storage on trip_legs · Added · files: supabase/migrations/20260618120000_trip_legs_ordered.sql, lib/supabase/types.ts · depends: — · high-stakes (migration → code-guardian) (merged 2026-06-18, PR #158) — forward-only migration adds nullable `position smallint` to `trip_legs`, backfills existing rows (morning→0/evening→1), drops `unique(trip_id, leg)` (`trip_legs_trip_id_leg_key`), and `alter column leg drop not null` so legs beyond the morning/evening enum exist (leg null, position >= 2). Distance/rider constraints untouched; no money backfill. `DbTripLeg.leg` now nullable + optional `position?: number | null`. Downstream: **SABAY-25** backfills `position` for every row + enforces NOT NULL + ordered uniqueness (its `trip_legs_position_enforce.sql`); SABAY-24/25 read/write the new column. Note widening `leg` to `| null` is a deliberate soundness cost — grep leg-readers before SABAY-25 adds new ones (`lib/sheets.ts` uses its own local leg type, unaffected).
- [x] SABAY-24 — Calc core: N ordered legs, parking on first leg · Changed · files: lib/calc.ts, lib/calc.test.ts · depends: — · high-stakes (money → code-guardian) (merged 2026-06-18, PR #159)
- [x] SABAY-25 — Data layer: persist + read + payments for N legs · Changed · files: lib/supabase/mappers.ts (+test), lib/store/trips.ts (+test), app/api/trips/route.ts (+test), supabase/migrations/<new>_trip_legs_position_enforce.sql, lib/supabase/types.ts · depends: SABAY-23, SABAY-24 · high-stakes (money + migration → code-guardian) (merged 2026-06-18, PR #160)
- [x] SABAY-26 — UI: leg-count control + read surfaces + cleanup · Added · files: app/page.tsx, components/LegCard.tsx, app/log/page.tsx, lib/sheets.ts, lib/store/trips.ts, lib/calc.ts, lib/supabase/mappers.ts (+ tests for legacy-mirror removal) · depends: SABAY-25 (merged 2026-06-18, PR #161) — Trip page renders `legs[]` with a +/− stepper (default 2, min 1; new leg = skyway/no riders/`roundTripKm/2`); `LegCard` now takes `label` ("Leg N") + explicit `applyParking` instead of a leg name; Log + Sheets export iterate `legs[]`. Removed the day-level morning/evening mirror: `DayInputLegacy` + `DayBreakdown.morning/evening` (calc), `StoredTrip.morning/evening` (now required `legs[]`), and the mapper's mirror construction (+ their tests). **The DB-level leg-naming enum stays** (`DbTripLeg.leg = "morning"|"evening"|null`, names first two legs for storage + ordering) per SABAY-23 — "no morning/evening references remain" means the app-level mirror only. **Touched 3 files beyond the listed scope** (pre-approved): `app/api/trips/route.ts` (+test) and `app/api/sheets/export/route.ts` (+test) — both consumed the removed shape and were explicitly deferred here by SABAY-25's bridge comments; plus `scripts/backfill-payments.ts` — compile fallout from removing `DayInputLegacy`, migrated to `legs[]` ordered by position. No new tables/columns/endpoints; money split unchanged (calcLeg signature stable).

## Sprint 3 — App tour, profile identity & invites   (planned 2026-06-16 · released v1.8.0 2026-06-18)
Epic: SABAY-11 · base branch: `main` · target version: v1.8.0

Two themes folded into one sprint. (a) Tour correctness + reach: drop the dead fill-ups step and
fold mileage into Settings copy, add a Groups/Members step, give passengers a dedicated tour, and
allow bidirectional (Back) navigation — all in components/OnboardingTour.tsx (serial, shared file).
(b) Profile identity + invites: add first/last name to profiles (display_name composed "First Last"
for backward-compat), capture it on the Account page + a one-time first-run prompt, make the
member/driver dropdown + roster use account names (backfill linked passengers), and actually email
group invitations via Supabase admin.inviteUserByEmail. Units 4 & 6 add migrations + Unit 7 touches
auth/admin → code-guardian gate. No money flow.

- [x] SABAY-12 — Fix tour content + add Back navigation · Fixed · files: components/OnboardingTour.tsx · depends: — (merged 2026-06-16, PR #145) — tour copy corrected + bidirectional Back navigation added.
- [x] SABAY-13 — Groups & Members tour step · Added · files: components/OnboardingTour.tsx, app/groups/page.tsx, app/admin/members/page.tsx · depends: SABAY-12 (merged 2026-06-16, PR #146) — added a Groups/Members onboarding step.
- [x] SABAY-14 — Dedicated passenger tour · Added · files: components/OnboardingTour.tsx · depends: SABAY-12, SABAY-13 (merged 2026-06-16, PR #147) — passenger-specific tour via `PASSENGER_STEPS`/`DRIVER_STEPS` switched on `isPassenger`. (Ledger was stale — verified present in origin/main + origin/develop on 2026-06-17.)
- [x] SABAY-15 — Profile first/last name: schema + API · Added · files: supabase/migrations/<new>_profile_names.sql, lib/supabase/types.ts, lib/supabase/mappers.ts, lib/store/profile.ts, app/api/profile/route.ts · depends: — · high-stakes (migration) (merged 2026-06-16) — `profiles.first_name`/`last_name` columns; `display_name` composed "First Last" for backward-compat; `useProfile` store + `/api/profile` PATCH accept `firstName`/`lastName`. Downstream: SABAY-16 (done) consumes the store/API; SABAY-17 backfills linked passenger names from these columns.
- [x] SABAY-16 — Name on Account page + first-run prompt · Added · files: app/account/AccountForm.tsx, components/NamePrompt.tsx, app/page.tsx · depends: SABAY-15 (merged 2026-06-16) — Account page gained a `NameSection` (first/last name form, seeded from the hydrated profile) and a one-time first-run `components/NamePrompt.tsx` modal shown on `/` when the hydrated profile has no name; both write via the SABAY-15 `useProfile.update`/`/api/profile`, and the prompt persists `cc:name-prompt:dismissed` in localStorage so it never re-shows after save or dismiss. Pure UI — no new tables/columns/endpoints. Downstream: none for SABAY-17/18.
- [x] SABAY-17 — Roster & dropdowns use account names + backfill · Changed · files: supabase/migrations/20260616130000_backfill_linked_passenger_names.sql, app/api/members/route.ts · depends: SABAY-15 · high-stakes (migration) (merged 2026-06-16) — backfill migration refreshes LINKED passengers' name from `profiles.display_name` (unlinked free-text passengers untouched, idempotent via `is distinct from`); `/api/members` PATCH auto-create-passenger fallback now name → email local-part → short id (matches `link_member_by_email`, never a raw UUID when email known). Roster UI (`app/settings/page.tsx`, `components/PassengerChips.tsx`) needed no edit — they already render `passenger.name`, which the data layer now populates with the account name; dropped from scope. No new tables/columns/endpoints. Downstream: SABAY-18 builds on the same `app/api/members/route.ts`.
- [x] SABAY-18 — Email group invitations · Fixed · files: app/api/members/route.ts, app/api/members/route.test.ts · depends: SABAY-17 · high-stakes (auth/email) (merged 2026-06-16) — `/api/members` POST now sends Supabase's invite email (`admin.inviteUserByEmail`, redirect → `/auth/confirm`) when `link_member_by_email` created a pending `member_invites` row (new email, no auth user). Sequenced AFTER the RPC because `inviteUserByEmail` creates the auth user immediately and would otherwise flip the RPC into the existing-user branch; new-vs-existing detected by re-reading `member_invites` for (group_id, email). Existing-account invites unchanged (no email); rate limit preserved; email-send failure / missing admin client degrade cleanly (log warn w/ groupId only, return ok — membership is durable and claimed on next sign-in via `claim_member_invite`). `lib/supabase/admin.ts` reused unchanged (dropped from scope). No new tables/columns/endpoints. **Follow-up needed (own migration ticket):** `link_member_by_email`/`claim_member_invite` RPCs do exact-case email match vs Supabase's lowercased `auth.users.email` — a mixed-case invite (`New@B.com`) can silently never be claimed.

## Sprint 2 — QoL & rebrand (toasts, purple theme, tour)   (planned 2026-06-15 · released v1.7.0 2026-06-15)
Epic: SABAY-6 · base branch: `main` · target version: v1.7.0

UI-layer QoL sprint: stylized toast feedback on all CRUD, blue→purple rebrand, richer app tour.
No migrations or money-flow changes — standard green-CI merges.
Decisions: success toast on explicit saves (gas button, mileage commit) + inline "Saved ✓" for
auto-saving sliders; #8200ff drives the brand scale with #814DB3 / #80619E as distinct accent tokens.

- [x] SABAY-7 — Brand rebrand: blue → #8200ff + accents · Changed · files: tailwind.config.ts, app/layout.tsx, app/manifest.ts · depends: — (merged 2026-06-15) — `brand` Tailwind scale is now a full purple ramp 50–900 (600 = #8200ff); previously-undefined 100/200/300/400/800/900 shades now render (latent colorless bug fixed); added `brand-secondary` (#814DB3) / `brand-accent` (#80619E) tokens; PWA `theme_color` purple in layout + manifest. `globals.css` needed no edit (chrome/buttons/links use `brand-*`, not the neutral `--primary` var). Downstream: SABAY-8/9/10 build on the purple `brand-*` palette + new accent tokens.
- [x] SABAY-8 — Settings / gas / mileage save feedback · Fixed/Changed · files: lib/store/settings.ts, app/gas/page.tsx, app/settings/page.tsx, lib/store/settings.test.ts · depends: SABAY-7 (merged 2026-06-15) — `setSettings`/`setGasPrice` now return an exported `SaveResult` (`{ok:true} | {ok:false,error}`) instead of swallowing errors; gas Save toasts success/error, mileage override commits on blur with a toast, auto-saving Trip-defaults/Split `Field` inputs show a transient inline "Saved ✓". Downstream: SABAY-9 can reuse the `SaveResult` pattern + Toast `success`/`error` variants for its CRUD toast sweep.
- [x] SABAY-9 — CRUD toast sweep (remaining resources) · Added · files: app/page.tsx, app/cars/page.tsx, app/cars/[carId]/page.tsx, app/admin/members/MembersAdmin.tsx, app/groups/page.tsx, app/log/page.tsx, app/settings/page.tsx (roster/fillups UI), lib/store/cars.ts, lib/store/fillups.ts · depends: SABAY-8 (merged 2026-06-15) — success/error toasts now fire on every CRUD across roster, cars, fillups, members, groups, trips. `cars.add`/`update` and `fillups.add`/`remove` now return the SABAY-8 `SaveResult` (`{ok:true} | {ok:false,error}`) instead of swallowing errors — these are the lib/store mutation entry points the issue named. Members + groups pages dropped their inline status `msg` in favour of toasts; cars page dropped inline `deleteError` for a toast. Downstream: SABAY-10 also edits app/cars/page.tsx — rebase on main before building.
- [x] SABAY-10 — App tour expansion · Changed · files: components/OnboardingTour.tsx, components/LegCard.tsx, app/cars/page.tsx · depends: SABAY-7 (merged 2026-06-15) — onboarding tour expanded 4→9 steps covering all primary nav (Trip/Log/Payments/Gas/Settings) + Members, the Sprint-1 Detours feature, Cars, and the weekly gas-price ritual. Tour now navigates to each step's `route` (`/` for Detours, `/cars` for Cars) and polls for the anchor after the route change, so every target resolves even though the tour fires on `/admin/members`; driver-only steps are filtered out for passengers (clamped cursor). New `data-tour` anchors: `tour-detours` (LegCard toggle), `tour-cars` (cars add section). `nav-trip`/`nav-payments` reused BottomNav's auto-generated anchors, so BottomNav.tsx + app/payments/page.tsx needed no edit. Done/Skip localStorage persistence unchanged.

## Sprint 1 — Per-passenger distance splitting (Model A)   (planned 2026-06-12 · released v1.6.0 2026-06-14)
Epic: SABAY-1 · base branch: `develop` · target version: v1.6.0

Model A: shared base (base-km gas + toll + parking) keeps the driver-favored ratio split;
each rider's detour gas is charged 100% to that rider. Backward-compatible — existing trips
have 0 extra km and produce identical numbers (no backfill).

- [x] SABAY-2 — Migration: per-rider extra distance · Added · files: supabase/migrations/<new>.sql, lib/supabase/types.ts · depends: — · high-stakes (migration) (merged 2026-06-14) — added `trip_leg_riders.extra_distance_km numeric(6,2) not null default 0 check (>= 0)` + `DbTripLegRider.extra_distance_km`. Downstream: SABAY-4 can now persist/read the column.
- [x] SABAY-3 — Calc core: Model A per-rider extra · Added/Changed · files: lib/calc.ts, lib/calc.test.ts · depends: — (merged 2026-06-14) — `calcLeg`/`calcDay` take optional per-rider `extraKmByRider`; `LegBreakdown.detourByRider` exposes per-rider detour gas added on top of the unchanged base split (additive, legacy numbers identical). Downstream: SABAY-4 threads `extraKmByRider` per leg into `calcDay` and reads/writes via `trip_leg_riders.extra_distance_km`.
- [x] SABAY-4 — Data layer: persist + read + payment calc · Added/Changed · files: lib/supabase/mappers.ts, lib/store/trips.ts, app/api/trips/route.ts · depends: SABAY-2, SABAY-3 · high-stakes (money split) (merged 2026-06-14) — `StoredTrip` legs gained optional `extraKmByRider`; `fromDbTrip` reads `trip_leg_riders.extra_distance_km` into per-leg maps (positive-only, legacy trips unchanged); trips route selects + validates (`>= 0`) + persists per-rider extras and threads them into `calcDay` so `trip_payments` reflect detours. Downstream: SABAY-5 UI reads/writes `morning.extraKmByRider` / `evening.extraKmByRider` on `StoredTrip`.
- [x] SABAY-5 — UI: tabbed leg card (Simple / Detours) · Added · files: components/LegCard.tsx, app/page.tsx, components/PassengerChips.tsx · depends: SABAY-4 (merged 2026-06-14) — `LegState` gained optional `extraKmByRider`; LegCard has a Simple/Detours toggle (active tab derived from any extra > 0 on load), Detours mode shows per-passenger extra-km inputs with live per-rider shares, prunes detours when riders are deselected and clears them on switch to Simple; `app/page.tsx` threads `extraKmByRider` into `calcDay` and keys LegCards by date. `PassengerChips.tsx` unchanged. No DB/endpoint changes.

## Hotfixes

### SABAY-19 — Profile first/last name not persisting (re-prompts every login)   (planned 2026-06-17 · released v1.8.0 2026-06-18)
Bug: name appears to save but is gone next session/device and the prompt re-fires. Root cause:
`lib/store/profile.ts` `update()` swallows PATCH failures (re-hydrates, never rethrows), so NamePrompt
+ AccountForm always report success even when the server write failed — masking the real failure
(most likely SABAY-15's `profile_names` migration not applied in the deployed DB, and a non-resilient
`.update().single()` with no self-heal). Cross-group persistence already works (profiles keyed by
`user_id`, no `group_id`, not group-scoped) — **no code needed for that**. Ships as a PATCH bump.
- [x] SABAY-20 — Re-assert profile name columns + INSERT policy · Added · files: supabase/migrations/20260617120000_profile_names_resilience.sql · depends: — · high-stakes (migration/RLS → code-guardian) (merged 2026-06-17, PR #155) — idempotent migration re-asserts `profiles.first_name`/`last_name` (`add column if not exists`, safety net in case SABAY-15 never reached prod) + new self-only `profiles_insert_own` RLS policy (`for insert ... with check (user_id = (select auth.uid()))`, drop-then-create so re-runnable). Existing rows untouched. Migration applied to prod DB. Downstream: **SABAY-21** consumes this — convert `/api/profile` PATCH to an upsert (the new INSERT policy guards a path that doesn't exist until SABAY-21) and self-heal a missing trigger-created profile row.
- [x] SABAY-21 — Durable profile name save + honest errors · Fixed · files: app/api/profile/route.ts, lib/store/profile.ts, components/NamePrompt.tsx, app/api/profile/route.test.ts · depends: SABAY-20 (merged 2026-06-18, PR #156) — `/api/profile` PATCH now **upserts on `user_id`** (`onConflict: "user_id"`, payload carries `user_id`) so a signed-in user with a missing profile row self-heals via INSERT (guarded by SABAY-20's `profiles_insert_own`) instead of 500ing on a no-op UPDATE; `profile.update()` re-hydrates **then rethrows** on failure (store convention) so callers surface honest errors instead of a false success; `NamePrompt` treats the persisted DB name (`hasName`) as the real gate (re-prompts across devices until the name actually lands), localStorage flag now only suppresses an explicit "Not now", and a failed save marks nothing. `AccountForm` unchanged — its catch starts working once `update()` throws. Route test updated to assert the upsert (incl. `user_id`). Closes the SABAY-19 hotfix. No new tables/columns/endpoints.

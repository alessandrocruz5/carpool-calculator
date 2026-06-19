# Carpool Calculator — Sprints
Status: [ ] planned · [~] in progress · [x] merged · [-] cancelled (excluded from changelog)

## Sprint 5 — Go-live hardening + payment confirmation   (planned 2026-06-19)
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

- [ ] SABAY-28 — Invite overhaul: case-insensitive email + self-healing placeholder · Fixed/Changed · files: supabase/migrations/<new>.sql, app/api/members/route.ts (+test) · depends: — · high-stakes (migration+auth → code-guardian) · build: Opus 4.8 · thinking on (high) · effort high
- [ ] SABAY-29 — Mandatory name on first run · Changed · files: components/NamePrompt.tsx, app/page.tsx · depends: SABAY-28 · build: Sonnet 4.6 · thinking on (brief) · effort medium
- [ ] SABAY-30 — Rate-limit sweep on unprotected write/expensive routes · Changed · files: app/api/payments|settings|cars|fillups|gas-prices|passengers|account/delete|account/export|admin/archive-trips|disputes/[id]|groups/switch route.ts (+tests) · depends: — · guardian (auth surface) · build: Sonnet 4.6 · thinking on (brief) · effort medium
- [ ] SABAY-31 — Remove Sentry example scaffolding · Fixed · files: app/sentry-example-page/, app/api/sentry-example-api/ (delete) · depends: — · build: Haiku 4.5 · thinking off · effort low
- [ ] SABAY-32 — Penny-accurate split allocation · Fixed · files: lib/calc.ts, lib/calc.test.ts · depends: — · high-stakes (money → code-guardian) · build: Opus 4.8 · thinking on (high) · effort high
- [ ] SABAY-33 — Payment confirmation: schema + RLS · Added · files: supabase/migrations/<new>.sql, lib/supabase/types.ts · depends: — · high-stakes (migration+money+auth → code-guardian) · build: Opus 4.8 · thinking on (high) · effort high
- [ ] SABAY-34 — Payment confirmation: API (claim/confirm/24h expiry) · Added · files: app/api/payments/route.ts (+test), lib/store/payments.ts (+test) · depends: SABAY-33 · high-stakes (money+auth → code-guardian) · build: Opus 4.8 · thinking on (high) · effort high
- [ ] SABAY-35 — Payment confirmation: UI · Added · files: app/payments/page.tsx · depends: SABAY-34 · build: Sonnet 4.6 · thinking on (brief) · effort medium
- [ ] SABAY-36 — Payment notifications · Added · files: app/api/payments/route.ts, lib/push.ts · depends: SABAY-35 · guardian (notify surface) · build: Sonnet 4.6 · thinking on (brief) · effort medium

## Sprint 3 — App tour, profile identity & invites   (planned 2026-06-16)
Epic: SABAY-11 · base branch: `main` · target version: v1.8.0

Two themes folded into one sprint. (a) Tour correctness + reach: drop the dead fill-ups step and
fold mileage into Settings copy, add a Groups/Members step, give passengers a dedicated tour, and
allow bidirectional (Back) navigation — all in components/OnboardingTour.tsx (serial, shared file).
(b) Profile identity + invites: add first/last name to profiles (display_name composed "First Last"
for backward-compat), capture it on the Account page + a one-time first-run prompt, make the
member/driver dropdown + roster use account names (backfill linked passengers), and actually email
group invitations via Supabase admin.inviteUserByEmail. Units 4 & 6 add migrations + Unit 7 touches
auth/admin → code-guardian gate. No money flow.

- [ ] SABAY-12 — Fix tour content + add Back navigation · Fixed · files: components/OnboardingTour.tsx · depends: —
- [ ] SABAY-13 — Groups & Members tour step · Added · files: components/OnboardingTour.tsx, app/groups/page.tsx, app/admin/members/page.tsx · depends: SABAY-12
- [ ] SABAY-14 — Dedicated passenger tour · Added · files: components/OnboardingTour.tsx · depends: SABAY-12, SABAY-13
- [x] SABAY-15 — Profile first/last name: schema + API · Added · files: supabase/migrations/<new>_profile_names.sql, lib/supabase/types.ts, lib/supabase/mappers.ts, lib/store/profile.ts, app/api/profile/route.ts · depends: — · high-stakes (migration) (merged 2026-06-16) — `profiles.first_name`/`last_name` columns; `display_name` composed "First Last" for backward-compat; `useProfile` store + `/api/profile` PATCH accept `firstName`/`lastName`. Downstream: SABAY-16 (done) consumes the store/API; SABAY-17 backfills linked passenger names from these columns.
- [x] SABAY-16 — Name on Account page + first-run prompt · Added · files: app/account/AccountForm.tsx, components/NamePrompt.tsx, app/page.tsx · depends: SABAY-15 (merged 2026-06-16) — Account page gained a `NameSection` (first/last name form, seeded from the hydrated profile) and a one-time first-run `components/NamePrompt.tsx` modal shown on `/` when the hydrated profile has no name; both write via the SABAY-15 `useProfile.update`/`/api/profile`, and the prompt persists `cc:name-prompt:dismissed` in localStorage so it never re-shows after save or dismiss. Pure UI — no new tables/columns/endpoints. Downstream: none for SABAY-17/18.
- [x] SABAY-17 — Roster & dropdowns use account names + backfill · Changed · files: supabase/migrations/20260616130000_backfill_linked_passenger_names.sql, app/api/members/route.ts · depends: SABAY-15 · high-stakes (migration) (merged 2026-06-16) — backfill migration refreshes LINKED passengers' name from `profiles.display_name` (unlinked free-text passengers untouched, idempotent via `is distinct from`); `/api/members` PATCH auto-create-passenger fallback now name → email local-part → short id (matches `link_member_by_email`, never a raw UUID when email known). Roster UI (`app/settings/page.tsx`, `components/PassengerChips.tsx`) needed no edit — they already render `passenger.name`, which the data layer now populates with the account name; dropped from scope. No new tables/columns/endpoints. Downstream: SABAY-18 builds on the same `app/api/members/route.ts`.
- [ ] SABAY-18 — Email group invitations · Fixed · files: app/api/members/route.ts, lib/supabase/admin.ts, app/api/members/route.test.ts · depends: SABAY-17 · high-stakes (auth/email)

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
_none_

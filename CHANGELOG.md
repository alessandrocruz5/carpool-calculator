# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and this project adheres to
semantic versioning.

## [2.0.0] — 2026-06-21

Sprint 5 — Go-live hardening + payment confirmation. Launch-readiness sprint: invite
case-insensitive matching and self-healing placeholders, mandatory first-run name capture,
rate-limit sweep across unprotected routes, penny-accurate split allocation, and a full
payment-confirmation handshake (passenger claims → driver confirms, 24h expiry, web-push
on both events). First major version; marks the app fit for production use.

### Added
- Payment-confirmation schema: `trip_payments.claimed_at`, `confirmed_at`, `expires_at`
  columns + `claim_payment`/`confirm_payment` RPCs with RLS gating (passenger can claim own
  unclaimed rows; driver can confirm within their group); `lib/supabase/types.ts` updated
  (SABAY-33).
- Payment-confirmation API: `/api/payments` POST actions `claim`/`confirm`, 24 h expiry
  enforced server-side, `payments` store extended with `claim(id)`/`confirm(id)` (SABAY-34).
- Payment-confirmation UI: Payments page shows per-row "Mark as paid" / "Confirm" / "Pending
  confirmation" / "Expired — re-mark" states with optimistic updates (SABAY-35).
- Web-push on payment events: passenger receives a push on driver confirm; driver receives a
  push on passenger claim; both fire from `/api/payments` via `lib/push.ts` (SABAY-36).

### Changed
- Invite overhaul: `link_member_by_email`/`claim_member_invite` now use `lower()` for
  case-insensitive email matching, eliminating silent stranding of mixed-case invites; a
  placeholder passenger row ("Pending invite") is created at invite time and self-healed to
  `display_name` via a `profiles` trigger on first sign-in (SABAY-28).
- Mandatory name on first run: `NamePrompt` no longer offers a "Not now" dismiss — the
  modal stays until the user provides a name, ensuring the SABAY-28 self-heal always has a
  name to write (SABAY-29).
- Rate-limit sweep: `payments`, `settings`, `cars`, `fillups`, `gas-prices`, `passengers`,
  `account/delete`, `account/export`, `admin/archive-trips`, `disputes/[id]`, and
  `groups/switch` routes all now enforce per-user rate limits (SABAY-30).

### Fixed
- Penny-accurate split allocation: passenger shares now use a largest-remainder algorithm so
  the sum of rounded shares always equals the total exactly, eliminating off-by-one rounding
  errors (SABAY-32).
- Sentry example scaffolding (`app/sentry-example-page/`, `app/api/sentry-example-api/`)
  removed — was live in production and exposed an unintentional error trigger (SABAY-31).

## [1.9.0] — 2026-06-18

Sprint 4 — variable trip legs. The Trip page generalizes from a fixed
morning/evening pair to an ordered list of N legs (default 2, minimum 1), with the
same per-leg cost split summing into the day total and parking applied to the first
leg only. Shipped as an expand→contract sequence (migration → calc → data layer →
UI). No money backfill — legacy two-leg trips compute identically.

### Added
- Ordered N-leg storage: `trip_legs.position` (forward-only migration backfills
  morning→0/evening→1, drops the `unique(trip_id, leg)` constraint, widens `leg`
  nullable; a follow-up migration enforces `position` NOT NULL + ordered
  uniqueness) (SABAY-23 / SABAY-25).
- Trip page leg-count control: a +/− stepper renders `legs[]` (default 2, min 1); a
  new leg defaults to skyway / no riders / half the round-trip distance. Each leg is
  independently configurable and the total + per-passenger amounts update live and
  persist. `LegCard` now takes a "Leg N" label + explicit parking flag, and the Log
  view and Google Sheets export iterate all legs (SABAY-26).

### Changed
- Calc core computes N ordered legs with parking on the first leg only; `calcDay`
  takes an ordered `legs[]` and `calcLeg` accepts an explicit `applyParking` flag
  (SABAY-24).
- Data layer persists, reads, and prices N legs end-to-end: the mapper returns
  ordered `legs[]`, the trips store/route round-trip them, and `trip_payments` are
  computed per leg (SABAY-25). The day-level morning/evening mirror was removed
  across calc, the trips store, the mapper, and the read surfaces; the DB-level
  leg-naming enum (`trip_legs.leg`) is retained for the first two legs (SABAY-26).

## [1.8.0] — 2026-06-18

Sprint 3 — app tour, profile identity & invites, plus the SABAY-19 profile-name
persistence hotfix folded in. Tour correctness and reach, real first/last names on
profiles wired through the roster and invitations, and a durable name save.

### Added
- First/last name on profiles: `profiles.first_name`/`last_name` columns with
  `display_name` composed "First Last" for backward-compat; `useProfile` store +
  `/api/profile` accept `firstName`/`lastName` (SABAY-15).
- Name capture UI: an Account-page name form plus a one-time first-run name prompt
  shown when the signed-in profile has no name yet (SABAY-16).
- Onboarding tour gained a Groups/Members step (SABAY-13) and a dedicated
  passenger tour (`PASSENGER_STEPS`/`DRIVER_STEPS` switched on `isPassenger`,
  SABAY-14).

### Changed
- Roster and member/driver dropdowns now show account names; a backfill migration
  refreshes linked passengers' names from `profiles.display_name` (unlinked
  free-text passengers untouched), and the members auto-create fallback resolves
  name → email local-part → short id, never a raw UUID (SABAY-17).
- Onboarding tour copy corrected and bidirectional Back navigation added (SABAY-12).

### Fixed
- Group invitations are now actually emailed: `/api/members` POST sends Supabase's
  invite email (`admin.inviteUserByEmail`) for brand-new invitees, sequenced after
  the link RPC; existing-account invites unchanged, email-send failures degrade
  cleanly (SABAY-18).
- Profile name now saves durably and reports honestly: `/api/profile` upserts on
  `user_id` so a missing profile row self-heals instead of 500ing, an idempotent
  migration re-asserts the name columns + adds a self-only `profiles_insert_own`
  RLS policy, `profile.update()` rethrows on failure, and the name prompt re-asks
  across devices until the name actually lands in the DB (SABAY-19 / SABAY-20 /
  SABAY-21).

## [1.7.0] — 2026-06-15

Sprint 2 — QoL & rebrand. Stylized toast feedback across all CRUD, a blue→purple
brand rebrand, and a richer onboarding tour. No migrations or money-flow changes.

### Added
- Success/error toasts on every CRUD flow across roster, cars, fillups, members,
  groups, and trips; `cars.add`/`update` and `fillups.add`/`remove` now return a
  `SaveResult` instead of swallowing errors (SABAY-9).

### Changed
- Brand palette rebranded blue → purple: `brand` Tailwind scale is now a full ramp
  50–900 (600 = #8200ff), with new `brand-secondary` (#814DB3) / `brand-accent`
  (#80619E) tokens and purple PWA `theme_color` (SABAY-7).
- Settings/gas/mileage saves give explicit feedback: `setSettings`/`setGasPrice`
  return a `SaveResult`, gas Save and mileage-override commits toast success/error,
  and auto-saving Trip-defaults/Split fields show a transient inline "Saved ✓"
  (SABAY-8).
- Onboarding tour expanded 4→9 steps covering all primary nav plus the Detours
  feature, Cars, and the weekly gas-price ritual; the tour now navigates to each
  step's page so every highlight resolves, and skips driver-only steps for
  passengers (SABAY-10).

### Fixed
- Previously-undefined `brand` 100/200/300/400/800/900 shades now render, fixing a
  latent colorless-class bug (SABAY-7).

## [1.6.0] — 2026-06-14

Sprint 1 — Per-passenger distance splitting (Model A). Shared base cost (base-km gas
+ toll + parking) keeps the driver-favored ratio split; each rider's detour gas is
charged 100% to that rider on top. Backward-compatible: existing trips have 0 extra km
and produce identical numbers.

### Added
- `trip_leg_riders.extra_distance_km` column for per-rider detour distance (SABAY-2).
- `calcLeg`/`calcDay` accept per-rider `extraKmByRider`; `LegBreakdown.detourByRider`
  exposes each rider's detour gas, added on top of the unchanged base split (SABAY-3).
- Trips persist and read per-rider extra distance through to `trip_payments` (SABAY-4).
- LegCard Simple/Detours tabs: Detours mode adds per-passenger extra-km inputs with a
  live per-rider breakdown, and the active tab is derived from any extra > 0 on load
  (SABAY-5).

### Changed
- Day total and trip payments now include per-rider detour gas when detours are set
  (SABAY-3, SABAY-4).

## [1.5.0] — 2026-06-04

Mileage override system overhaul

- Added an explicit toggle to control whether the manual mileage override takes priority over the measured rolling average — the rolling average is preferred by default once fill-up data is available.
- Introduced `resolveEffectiveMileage()` as the single source of truth for mileage resolution across the UI and trip-creation API, so payment splits always match what the settings screen displays.
- Rolling average is now written back to the car record on every fill-up, so cost estimates stay current without requiring a page refresh.
- The override is automatically disabled the first time a rolling average becomes computable, so users see real measured data by default.
- Database migration adds `mileage_override_enabled` to the settings table.

## [1.4.1] — 2026-06-03

Constraint & migration fixes

- Fixed trips and gas prices unique constraints to be scoped per group, preventing false conflicts when multiple groups share the same date.
- Fixed gas price upsert to use the new group-scoped constraint.
- Fixed three CRUD constraint bugs introduced by the per-leg distance migrations.
- Reconciled migration filenames to match the live Supabase ledger timestamps (internal, no schema change).

## [1.4.0] — 2026-06-02

Per-leg distance tracking & navigation redesign

- Each trip leg now carries its own distance, enabling accurate cost splits for asymmetric morning and evening routes. Existing trips are backfilled from the round-trip setting.
- Distance input added to the trip UI for morning and evening legs independently.
- Full navigation IA redesign: account, groups, members, and sign-out collapsed into a single account menu; bottom tabs now driven by a centralised `navConfig` with role-based filtering and Lucide icons.
- Toast notifications upgraded with success, error, and info variants, improved animations, dismiss button, and proper ARIA attributes.
- App rebranded from "Carpool Calculator" to "Sabay" across all page titles, metadata, and the PWA manifest.
- "Manage cars" shortcut added to the settings page.

## [1.3.1] — 2026-06-01

Member management fixes

- Linked passenger is now deactivated automatically when a member is removed from the group.
- Passenger is deactivated when a member's role changes from passenger to driver.
- Fixed field-reference errors in the audit log triggers for trips and trip legs.
- Members list now shows the member's email address instead of a raw UUID.

## [1.3.0] — 2026-06-01

Member visibility & group switching

- Members now show up reliably in the Trip dashboard and in the driver and passenger pickers.
- Fixed members not appearing after switching groups.
- Resolved a redirect loop that could occur when switching groups.
- Database fixes for member visibility across group-scoped data.

## [1.2.0] — 2026-05-30

Onboarding & release polish

- New first-run onboarding flow that creates your first group, with a redirect straight back into the app after you confirm your email.
- Faster pages: server session and role lookups are now cached and run in parallel.
- Live-product features and audit remediation rolled out together with database performance and security hardening.
- Added a pre-merge audit trail for develop to main integrations.

## [1.1.0] — 2026-05-29

Security & performance hardening

- Locked down SECURITY DEFINER database functions so they can no longer be called anonymously.
- Completed a full row-level-security (RLS) policy audit and tightened policies.
- Added a missing foreign-key index on trip disputes and dropped two redundant composite indexes for faster writes.
- Added CRUD performance baseline probes and audit snapshots to catch regressions.

## [1.0.0] — 2026-05-27

Public launch — the first release of Sabay.

- Trip splitting: per-leg cost splitting for morning and evening runs, with per-leg route toggles and a live day total per rider.
- Groups and roles: multi-tenant groups with profiles, members, and cars. Driver and passenger roles backed by Supabase auth and role-based access, with a read-only view for passengers.
- Cars and mileage: per-car fill-up tracking and rolling km/L, so estimates use your real fuel efficiency.
- Gas prices: gas price tracking with stale-price reminders delivered via web push notifications.
- Payments: payment tracking with bulk updates, plus a dispute reporting flow with admin resolution.
- Offline-first PWA: installable app with offline request queuing and toast notifications, plus loading skeletons across major routes.
- Accounts: email change, full data export, and account deletion.
- Operations: Sentry error monitoring with PII scrubbing and release tracking, Vercel Analytics and Speed Insights, audit logging, trip archival, rate limiting, security headers, and server-side authorization for admin routes.
- Quality: end-to-end tests with Playwright in CI and a comprehensive API and store test suite.

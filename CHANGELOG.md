# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and this project adheres to
semantic versioning.

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

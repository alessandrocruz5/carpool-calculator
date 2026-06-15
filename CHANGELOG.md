# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and this project adheres to
semantic versioning.

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

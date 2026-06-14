# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and this project adheres to
semantic versioning.

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

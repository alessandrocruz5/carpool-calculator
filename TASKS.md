# Carpool Calculator — Sprints
Status: [ ] planned · [~] in progress · [x] merged · [-] cancelled (excluded from changelog)

## Sprint 1 — Per-passenger distance splitting (Model A)   (planned 2026-06-12)
Epic: SABAY-1 · base branch: `develop` · target version: v1.6.0

Model A: shared base (base-km gas + toll + parking) keeps the driver-favored ratio split;
each rider's detour gas is charged 100% to that rider. Backward-compatible — existing trips
have 0 extra km and produce identical numbers (no backfill).

- [x] SABAY-2 — Migration: per-rider extra distance · Added · files: supabase/migrations/<new>.sql, lib/supabase/types.ts · depends: — · high-stakes (migration) (merged 2026-06-14) — added `trip_leg_riders.extra_distance_km numeric(6,2) not null default 0 check (>= 0)` + `DbTripLegRider.extra_distance_km`. Downstream: SABAY-4 can now persist/read the column.
- [x] SABAY-3 — Calc core: Model A per-rider extra · Added/Changed · files: lib/calc.ts, lib/calc.test.ts · depends: — (merged 2026-06-14) — `calcLeg`/`calcDay` take optional per-rider `extraKmByRider`; `LegBreakdown.detourByRider` exposes per-rider detour gas added on top of the unchanged base split (additive, legacy numbers identical). Downstream: SABAY-4 threads `extraKmByRider` per leg into `calcDay` and reads/writes via `trip_leg_riders.extra_distance_km`.
- [ ] SABAY-4 — Data layer: persist + read + payment calc · Added/Changed · files: lib/supabase/mappers.ts, lib/store/trips.ts, app/api/trips/route.ts · depends: SABAY-2, SABAY-3 · high-stakes (money split)
- [ ] SABAY-5 — UI: tabbed leg card (Simple / Detours) · Added · files: components/LegCard.tsx, app/page.tsx, components/PassengerChips.tsx · depends: SABAY-4

## Hotfixes
_none_

# Carpool Calculator — Sprints
Status: [ ] planned · [~] in progress · [x] merged · [-] cancelled (excluded from changelog)

## Sprint 2 — QoL & rebrand (toasts, purple theme, tour)   (planned 2026-06-15)
Epic: SABAY-6 · base branch: `main` · target version: v1.7.0

UI-layer QoL sprint: stylized toast feedback on all CRUD, blue→purple rebrand, richer app tour.
No migrations or money-flow changes — standard green-CI merges.
Decisions: success toast on explicit saves (gas button, mileage commit) + inline "Saved ✓" for
auto-saving sliders; #8200ff drives the brand scale with #814DB3 / #80619E as distinct accent tokens.

- [x] SABAY-7 — Brand rebrand: blue → #8200ff + accents · Changed · files: tailwind.config.ts, app/layout.tsx, app/manifest.ts · depends: — (merged 2026-06-15) — `brand` Tailwind scale is now a full purple ramp 50–900 (600 = #8200ff); previously-undefined 100/200/300/400/800/900 shades now render (latent colorless bug fixed); added `brand-secondary` (#814DB3) / `brand-accent` (#80619E) tokens; PWA `theme_color` purple in layout + manifest. `globals.css` needed no edit (chrome/buttons/links use `brand-*`, not the neutral `--primary` var). Downstream: SABAY-8/9/10 build on the purple `brand-*` palette + new accent tokens.
- [x] SABAY-8 — Settings / gas / mileage save feedback · Fixed/Changed · files: lib/store/settings.ts, app/gas/page.tsx, app/settings/page.tsx, lib/store/settings.test.ts · depends: SABAY-7 (merged 2026-06-15) — `setSettings`/`setGasPrice` now return an exported `SaveResult` (`{ok:true} | {ok:false,error}`) instead of swallowing errors; gas Save toasts success/error, mileage override commits on blur with a toast, auto-saving Trip-defaults/Split `Field` inputs show a transient inline "Saved ✓". Downstream: SABAY-9 can reuse the `SaveResult` pattern + Toast `success`/`error` variants for its CRUD toast sweep.
- [x] SABAY-9 — CRUD toast sweep (remaining resources) · Added · files: app/page.tsx, app/cars/page.tsx, app/cars/[carId]/page.tsx, app/admin/members/MembersAdmin.tsx, app/groups/page.tsx, app/log/page.tsx, app/settings/page.tsx (roster/fillups UI), lib/store/cars.ts, lib/store/fillups.ts · depends: SABAY-8 (merged 2026-06-15) — success/error toasts now fire on every CRUD across roster, cars, fillups, members, groups, trips. `cars.add`/`update` and `fillups.add`/`remove` now return the SABAY-8 `SaveResult` (`{ok:true} | {ok:false,error}`) instead of swallowing errors — these are the lib/store mutation entry points the issue named. Members + groups pages dropped their inline status `msg` in favour of toasts; cars page dropped inline `deleteError` for a toast. Downstream: SABAY-10 also edits app/cars/page.tsx — rebase on main before building.
- [ ] SABAY-10 — App tour expansion · Changed · files: components/OnboardingTour.tsx, components/nav/BottomNav.tsx, components/LegCard.tsx, app/payments/page.tsx, app/cars/page.tsx · depends: SABAY-7

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

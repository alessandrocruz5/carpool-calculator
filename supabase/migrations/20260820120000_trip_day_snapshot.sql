-- Per-trip day snapshot (Sprint 8, SABAY-46). Store the two calc inputs that
-- drift over time -- rolling mileage (km/L) and gas price -- directly on the
-- `trips` row so a backfilled trip can price as of its own date instead of the
-- current save-time values (SABAY-47 freezes/reads these).
--
-- Both columns are NULLABLE with zero backfill: a NULL snapshot means "legacy
-- trip", which recomputes exactly as today (numbers byte-identical). RLS is
-- unchanged -- these columns inherit the existing `trips` table policies.
--
-- Idempotent: `add column if not exists` + constraint guards so re-running is a
-- no-op.
-- mileage_kml is numeric(6,3) to match `settings.mileage_kml_override` and the
-- unrounded float from `rollingMileage()`, so a frozen *today* trip recomputes
-- byte-identically to the live recompute (SABAY-47's guarantee).
alter table trips
  add column if not exists mileage_kml numeric(6,3);

alter table trips
  add column if not exists gas_price_php numeric(8,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trips_mileage_kml_positive'
  ) then
    alter table trips
      add constraint trips_mileage_kml_positive check (mileage_kml > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'trips_gas_price_php_nonneg'
  ) then
    alter table trips
      add constraint trips_gas_price_php_nonneg check (gas_price_php >= 0);
  end if;
end $$;

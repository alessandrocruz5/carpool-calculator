-- Restore mileage_kml_override on settings.
-- The column was accidentally dropped in 20260522023600_multitenancy_columns.sql
-- while the settings UI and all mapper code still read and write it.
-- Any PATCH /api/settings call that includes mileageKmPerL failed with
-- "column mileage_kml_override does not exist".

alter table settings
  add column if not exists mileage_kml_override numeric(6,3);

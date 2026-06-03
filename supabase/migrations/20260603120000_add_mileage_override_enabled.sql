-- Add a toggle that controls whether the manual mileage override is in effect.
-- When false (default), the measured rolling average is preferred and the
-- override only backstops it when no rolling average exists yet. When true,
-- the override takes priority over the rolling average until switched off.

alter table settings
  add column if not exists mileage_override_enabled boolean not null default false;

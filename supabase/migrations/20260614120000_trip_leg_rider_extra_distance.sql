-- Per-rider detour distance (Model A). Backward-compatible: existing riders default
-- to 0 extra km, so legacy trips produce identical numbers. RLS unchanged.
alter table trip_leg_riders
  add column extra_distance_km numeric(6,2) not null default 0;

alter table trip_leg_riders
  add constraint trip_leg_riders_extra_distance_nonneg check (extra_distance_km >= 0);

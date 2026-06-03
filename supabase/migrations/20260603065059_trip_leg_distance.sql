alter table trip_legs add column distance_km numeric(6,2);

update trip_legs tl set distance_km = coalesce((select round_trip_km from settings s
  where s.group_id = tl.group_id), 42) / 2 where distance_km is null;

alter table trip_legs alter column distance_km set not null;

alter table trip_legs add constraint trip_legs_distance_positive check (distance_km > 0);

-- Fix unique constraints to be group-scoped now that multitenancy is in place.
-- The original schema had unique(date) on trips and unique(effective_date) on
-- gas_prices. Those are global, so a second group trying to save a trip on the
-- same calendar date hits a constraint violation. Replace both with composite
-- (group_id, date) / (group_id, effective_date) constraints instead.

-- trips: drop the single-column unique constraint, add group-scoped one
alter table trips drop constraint if exists trips_date_key;
alter table trips add constraint trips_group_id_date_key unique (group_id, date);

-- gas_prices: drop the single-column unique constraint, add group-scoped one
alter table gas_prices drop constraint if exists gas_prices_effective_date_key;
alter table gas_prices add constraint gas_prices_group_id_effective_date_key unique (group_id, effective_date);

-- Performance indexes for the two hottest query paths.
--
-- trips_group_date_idx: the GET /api/trips handler filters by group_id and
-- orders by date; a single composite index serves both clauses without a
-- separate sort step.
--
-- members_user_group_idx: the middleware and several API handlers look up a
-- member row by (user_id) or (user_id, group_id). The existing index on
-- user_id alone forces an extra filter; the composite covers both shapes.

create index if not exists trips_group_date_idx on trips(group_id, date);
create index if not exists members_user_group_idx on members(user_id, group_id);

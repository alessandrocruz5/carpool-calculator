-- Soft-delete / archive for trips.
-- Archived trips are excluded from active views (week, payments, log) but
-- remain visible to historical rollups (mileage, fillups join, exports).

alter table trips
  add column if not exists archived_at timestamptz;

-- Partial index so the "active" query path (the hot path) stays small.
create index if not exists trips_active_group_date_idx
  on trips (group_id, date desc)
  where archived_at is null;

-- Helper: archive trips older than N days for a group. Driver-only invocation
-- is enforced in the API layer.
create or replace function archive_old_trips(p_group_id uuid, p_older_than_days integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if p_older_than_days < 1 then
    raise exception 'p_older_than_days must be >= 1';
  end if;
  update trips
     set archived_at = now()
   where group_id    = p_group_id
     and archived_at is null
     and date        < (current_date - p_older_than_days);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function archive_old_trips(uuid, integer) from public;
grant  execute on function archive_old_trips(uuid, integer) to authenticated;

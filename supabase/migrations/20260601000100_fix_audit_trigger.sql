-- Fix _audit_trigger() field reference errors on trips and trip_legs tables.
-- The original function blindly accessed new.trip_id and new.trip_leg_id which
-- don't exist on all audited tables:
--   * trips     has `id` (not `trip_id`)         -> new.trip_id is invalid
--   * trip_legs has `trip_id` (not `trip_leg_id`) -> new.trip_leg_id is invalid
-- This crashed every INSERT/UPDATE/DELETE with:
--   record "new" has no field "trip_id"
-- Use TG_TABLE_NAME to conditionally access only the columns that exist on the
-- table being mutated. create or replace updates the body in-place; the existing
-- trips_audit / trip_legs_audit trigger bindings continue to resolve this name.

create or replace function _audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id   uuid;
  v_row_pk     text;
  v_action     audit_action;
  v_old_json   jsonb;
  v_new_json   jsonb;
begin
  if (tg_op = 'INSERT') then
    v_action   := 'insert';
    v_old_json := null;
    v_new_json := to_jsonb(new);
    v_row_pk   := new.id::text;
    if tg_table_name = 'trip_legs' then
      v_group_id := coalesce(new.group_id,
                             (select t.group_id from trips t where t.id = new.trip_id));
    else -- trips
      v_group_id := new.group_id;
    end if;

  elsif (tg_op = 'UPDATE') then
    v_action   := 'update';
    v_old_json := to_jsonb(old);
    v_new_json := to_jsonb(new);
    v_row_pk   := new.id::text;
    v_group_id := coalesce(new.group_id, old.group_id);

  else -- DELETE
    v_action   := 'delete';
    v_old_json := to_jsonb(old);
    v_new_json := null;
    v_row_pk   := old.id::text;
    if tg_table_name = 'trip_legs' then
      v_group_id := coalesce(old.group_id,
                             (select t.group_id from trips t where t.id = old.trip_id));
    else -- trips
      v_group_id := old.group_id;
    end if;
  end if;

  insert into audit_log (table_name, row_pk, action, actor_user_id, group_id, diff)
  values (tg_table_name, v_row_pk, v_action, auth.uid(), v_group_id,
          _audit_diff(v_old_json, v_new_json));

  return coalesce(new, old);
end;
$$;

-- Re-apply the lockdown: create or replace restores the implicit PUBLIC EXECUTE
-- grant, so revoke it again consistent with 20260529143305_secdef_lockdown.sql
-- and 20260530004033_secdef_lockdown_audit_archive.sql. Trigger-only function;
-- no client role should ever call it directly.
revoke execute on function _audit_trigger() from public, anon, authenticated;

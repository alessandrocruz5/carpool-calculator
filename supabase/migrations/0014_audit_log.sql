-- Audit log for trip-related mutations.
-- One row per INSERT/UPDATE/DELETE on trips, trip_legs, trip_leg_riders.
-- Drivers in the affected group can read their group's rows; nobody can
-- write directly (only the trigger does).

create type audit_action as enum ('insert', 'update', 'delete');

create table if not exists audit_log (
  id              bigserial primary key,
  table_name      text        not null,
  row_pk          text        not null,
  action          audit_action not null,
  actor_user_id   uuid        references auth.users(id) on delete set null,
  group_id        uuid        references groups(id)     on delete cascade,
  diff            jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index audit_log_group_created_idx
  on audit_log (group_id, created_at desc);
create index audit_log_table_row_idx
  on audit_log (table_name, row_pk);

alter table audit_log enable row level security;

-- Only drivers of the relevant group can SELECT.
create policy "audit_log_select_drivers" on audit_log
  for select to authenticated
  using (
    exists (
      select 1
      from   public.members m
      where  m.group_id = audit_log.group_id
        and  m.user_id  = (select auth.uid())
        and  m.role in ('driver', 'both')
    )
  );

-- No INSERT/UPDATE/DELETE policies → blocked for all authenticated users.
-- The trigger function runs as definer so it bypasses RLS.

-- Build a JSON diff of changed columns. For INSERT, diff = { col: [null, new] }.
-- For DELETE, diff = { col: [old, null] }. For UPDATE, only changed cols.
create or replace function _audit_diff(old_row jsonb, new_row jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := '{}'::jsonb;
  k text;
begin
  if old_row is null then
    for k in select jsonb_object_keys(new_row) loop
      result := result || jsonb_build_object(k, jsonb_build_array(null, new_row -> k));
    end loop;
    return result;
  end if;
  if new_row is null then
    for k in select jsonb_object_keys(old_row) loop
      result := result || jsonb_build_object(k, jsonb_build_array(old_row -> k, null));
    end loop;
    return result;
  end if;
  for k in select jsonb_object_keys(new_row) loop
    if (old_row -> k) is distinct from (new_row -> k) then
      result := result || jsonb_build_object(k,
        jsonb_build_array(old_row -> k, new_row -> k));
    end if;
  end loop;
  return result;
end;
$$;

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
    v_row_pk   := coalesce(new.id::text, '');
    v_group_id := coalesce(new.group_id,
                           (select t.group_id from trips t where t.id = new.trip_id),
                           (select tl.group_id from trip_legs tl where tl.id = new.trip_leg_id));
  elsif (tg_op = 'UPDATE') then
    v_action   := 'update';
    v_old_json := to_jsonb(old);
    v_new_json := to_jsonb(new);
    v_row_pk   := coalesce(new.id::text, '');
    v_group_id := coalesce(new.group_id, old.group_id);
  else -- DELETE
    v_action   := 'delete';
    v_old_json := to_jsonb(old);
    v_new_json := null;
    v_row_pk   := coalesce(old.id::text, '');
    v_group_id := coalesce(old.group_id,
                           (select t.group_id from trips t where t.id = old.trip_id),
                           (select tl.group_id from trip_legs tl where tl.id = old.trip_leg_id));
  end if;

  insert into audit_log (table_name, row_pk, action, actor_user_id, group_id, diff)
  values (tg_table_name, v_row_pk, v_action, auth.uid(), v_group_id,
          _audit_diff(v_old_json, v_new_json));

  return coalesce(new, old);
end;
$$;

-- trip_leg_riders has a composite PK (trip_leg_id, passenger_id); store
-- it as "<leg>:<passenger>" via a tiny wrapper.
create or replace function _audit_trigger_riders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_row_pk   text;
  v_action   audit_action;
  v_old_json jsonb;
  v_new_json jsonb;
begin
  if (tg_op = 'INSERT') then
    v_action   := 'insert';
    v_old_json := null;
    v_new_json := to_jsonb(new);
    v_row_pk   := new.trip_leg_id::text || ':' || new.passenger_id::text;
    v_group_id := coalesce(new.group_id,
                           (select tl.group_id from trip_legs tl where tl.id = new.trip_leg_id));
  elsif (tg_op = 'UPDATE') then
    v_action   := 'update';
    v_old_json := to_jsonb(old);
    v_new_json := to_jsonb(new);
    v_row_pk   := new.trip_leg_id::text || ':' || new.passenger_id::text;
    v_group_id := coalesce(new.group_id, old.group_id);
  else
    v_action   := 'delete';
    v_old_json := to_jsonb(old);
    v_new_json := null;
    v_row_pk   := old.trip_leg_id::text || ':' || old.passenger_id::text;
    v_group_id := coalesce(old.group_id,
                           (select tl.group_id from trip_legs tl where tl.id = old.trip_leg_id));
  end if;

  insert into audit_log (table_name, row_pk, action, actor_user_id, group_id, diff)
  values (tg_table_name, v_row_pk, v_action, auth.uid(), v_group_id,
          _audit_diff(v_old_json, v_new_json));

  return coalesce(new, old);
end;
$$;

create trigger trips_audit
  after insert or update or delete on trips
  for each row execute function _audit_trigger();

create trigger trip_legs_audit
  after insert or update or delete on trip_legs
  for each row execute function _audit_trigger();

create trigger trip_leg_riders_audit
  after insert or update or delete on trip_leg_riders
  for each row execute function _audit_trigger_riders();

-- Pruner: keep last 90 days. Scheduled via pg_cron from app code.
create or replace function prune_audit_log()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from audit_log where created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function prune_audit_log() from public;

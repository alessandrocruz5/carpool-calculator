-- ============================================================================
-- 0021 — re-lock SECURITY DEFINER functions recreated by 0014/0015
-- ============================================================================
-- 0018_secdef_lockdown ran on the live DB before the audit/archive functions
-- existed (0014/0015 were applied later), so its existence-guarded REVOKEs
-- skipped them. Recreating the functions restored the implicit PUBLIC EXECUTE
-- grant, re-exposing them via PostgREST RPC. This migration re-applies 0018's
-- treatment for exactly those functions. Idempotent.

-- Trigger-only functions: no client role should ever call these directly.
do $$
begin
  if to_regprocedure('public._audit_trigger()') is not null then
    revoke execute on function public._audit_trigger() from public, anon, authenticated;
  end if;
end $$;

do $$
begin
  if to_regprocedure('public._audit_trigger_riders()') is not null then
    revoke execute on function public._audit_trigger_riders() from public, anon, authenticated;
  end if;
end $$;

-- Maintenance / cron-only RPC: runs as owner from scheduled jobs.
do $$
begin
  if to_regprocedure('public.prune_audit_log()') is not null then
    revoke execute on function public.prune_audit_log() from public, anon, authenticated;
  end if;
end $$;

-- Driver-triggered maintenance RPC: keep authenticated, revoke public/anon.
-- Internal authorization is enforced in the API route.
do $$
begin
  if to_regprocedure('public.archive_old_trips(uuid, integer)') is not null then
    revoke execute on function public.archive_old_trips(uuid, integer) from public, anon;
    grant  execute on function public.archive_old_trips(uuid, integer) to authenticated;
  end if;
end $$;

-- Pin search_path on the pure jsonb helper to clear the mutable-search_path lint.
do $$
begin
  if to_regprocedure('public._audit_diff(jsonb, jsonb)') is not null then
    alter function public._audit_diff(jsonb, jsonb) set search_path = public;
  end if;
end $$;

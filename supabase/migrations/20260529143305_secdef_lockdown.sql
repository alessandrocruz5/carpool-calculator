-- ============================================================================
-- 0018 — SECURITY DEFINER lockdown
-- ============================================================================
--
-- Threat model
-- ------------
-- Every function in the `public` schema is reachable by PostgREST as an RPC
-- endpoint (`POST /rest/v1/rpc/<fn>`). A SECURITY DEFINER function runs with
-- the *owner's* privileges (here: a superuser/`postgres`), bypassing RLS. If
-- such a function still carries an EXECUTE grant that covers the `anon` role,
-- an unauthenticated caller can invoke it directly over the public API and act
-- with elevated privileges — regardless of any application-layer auth checks.
--
-- PostgreSQL grants EXECUTE to PUBLIC by default at function-creation time, and
-- the `anon` role inherits from PUBLIC. So a bare `REVOKE ... FROM anon` is a
-- no-op while the PUBLIC grant survives — the role is still covered. To truly
-- close anon access you must `REVOKE ... FROM PUBLIC` and then re-`GRANT` only
-- to the roles that legitimately need it.
--
-- What this migration does
-- ------------------------
-- Makes the locked-down state of every SECURITY DEFINER function in `public`
-- explicit and declarative, so it survives future re-grants and is auditable
-- in one place. It is idempotent (safe to re-run) and uses `to_regprocedure()`
-- existence guards in place of the `IF EXISTS` clause that REVOKE/GRANT lack.
--
-- Relationship to prior migrations
-- --------------------------------
--   * 0012_security_revoke_public_execute.sql already revoked PUBLIC and
--     re-granted `authenticated` for the 7 RPC/helper functions. Here we add
--     the explicit `REVOKE ... FROM anon` belt-and-suspenders (and fully lock
--     `handle_new_user`).
--   * 0014_audit_log.sql revoked PUBLIC from `prune_audit_log` but NOT from the
--     trigger functions `_audit_trigger` / `_audit_trigger_riders` — those are
--     still PUBLIC-callable today and are closed here (real anon exposure).
--   * 0015_trip_archive.sql revoked PUBLIC and granted `authenticated` for
--     `archive_old_trips`; we add the declarative anon revoke.
--
-- Inventory note
-- --------------
-- docs/audit/secdef-inventory.md classifies only 7 functions (it was captured
-- from `routine_privileges`, which omits functions that carry only the implicit
-- PUBLIC grant). The actual SECURITY DEFINER set in `public` is larger; the
-- extras handled below are `_audit_trigger`, `_audit_trigger_riders` (trigger-
-- only). `is_member()` / `is_driver()` were SECURITY DEFINER but were dropped
-- in 0007, so they no longer exist and are intentionally not referenced here.
-- The inventory doc should be reconciled with this set in a follow-up.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Trigger-only functions — no client role should ever call these directly.
--    Revoke from PUBLIC, anon, and authenticated. They fire from triggers and
--    run as the table owner, so removing all client EXECUTE grants does not
--    affect trigger execution.
-- ----------------------------------------------------------------------------

-- handle_new_user(): fires on auth.users insert.
do $$
begin
  if to_regprocedure('public.handle_new_user()') is not null then
    revoke execute on function public.handle_new_user() from public, anon, authenticated;
  end if;
end $$;

-- _audit_trigger(): generic row-audit trigger (was never revoked — real hole).
do $$
begin
  if to_regprocedure('public._audit_trigger()') is not null then
    revoke execute on function public._audit_trigger() from public, anon, authenticated;
  end if;
end $$;

-- _audit_trigger_riders(): rider-specific audit trigger (was never revoked).
do $$
begin
  if to_regprocedure('public._audit_trigger_riders()') is not null then
    revoke execute on function public._audit_trigger_riders() from public, anon, authenticated;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. RLS-predicate helpers — invoked from RLS policies, so they MUST remain
--    callable by `authenticated`. Revoke anon (PUBLIC already revoked in 0012).
-- ----------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.is_group_member(uuid)') is not null then
    revoke execute on function public.is_group_member(uuid) from anon;
    grant  execute on function public.is_group_member(uuid) to authenticated;
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.is_group_driver(uuid)') is not null then
    revoke execute on function public.is_group_driver(uuid) from anon;
    grant  execute on function public.is_group_driver(uuid) to authenticated;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Member-only RPCs — signed-in users invoke these from the app. Keep
--    `authenticated`; revoke anon (PUBLIC already revoked in 0012). Internal
--    authorization (e.g. "caller is a driver of the group") is enforced inside
--    each function body / API route, not by the grant alone.
-- ----------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.create_group(text)') is not null then
    revoke execute on function public.create_group(text) from anon;
    grant  execute on function public.create_group(text) to authenticated;
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.rename_group(uuid, text)') is not null then
    revoke execute on function public.rename_group(uuid, text) from anon;
    grant  execute on function public.rename_group(uuid, text) to authenticated;
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.link_member_by_email(uuid, text, text)') is not null then
    revoke execute on function public.link_member_by_email(uuid, text, text) from anon;
    grant  execute on function public.link_member_by_email(uuid, text, text) to authenticated;
  end if;
end $$;

do $$
begin
  if to_regprocedure('public.claim_member_invite()') is not null then
    revoke execute on function public.claim_member_invite() from anon;
    grant  execute on function public.claim_member_invite() to authenticated;
  end if;
end $$;

-- archive_old_trips(): driver-triggered maintenance RPC, called from
-- app/api/admin/archive-trips/route.ts under the user's authenticated session.
-- Keep `authenticated`; revoke anon (PUBLIC already revoked in 0015).
do $$
begin
  if to_regprocedure('public.archive_old_trips(uuid, integer)') is not null then
    revoke execute on function public.archive_old_trips(uuid, integer) from anon;
    grant  execute on function public.archive_old_trips(uuid, integer) to authenticated;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. Maintenance / cron-only RPCs — no client role should call these. They run
--    from scheduled jobs as `postgres`/owner. Revoke anon and authenticated
--    (PUBLIC already revoked in 0014); leave owner/superuser execution intact.
-- ----------------------------------------------------------------------------

do $$
begin
  if to_regprocedure('public.prune_audit_log()') is not null then
    revoke execute on function public.prune_audit_log() from anon, authenticated;
  end if;
end $$;

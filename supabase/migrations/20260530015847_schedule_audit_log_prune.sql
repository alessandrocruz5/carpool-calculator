-- Schedule the audit_log pruner (0014/audit_log created prune_audit_log() but
-- nothing scheduled it, so audit_log would grow unbounded). Runs weekly; the
-- function itself enforces the 90-day retention window.
--
-- prune_audit_log() is SECURITY DEFINER owned by the superuser and had its
-- EXECUTE revoked from all client roles in secdef_lockdown_audit_archive. The
-- cron job runs as the scheduling role (postgres), which can still execute it.
-- Idempotent: cron.schedule upserts by job name.

create extension if not exists pg_cron;

select cron.schedule(
  'prune-audit-log',
  '0 3 * * 0',                 -- Sundays 03:00 UTC
  $$select public.prune_audit_log();$$
);

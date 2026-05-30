-- Performance advisor fixes.
--
-- Background: the Sprint 2 RLS audit (docs/audit/rls-analysis.md) confirmed the
-- RLS issues originally scoped for this migration — bare auth.uid() calls and
-- duplicate PERMISSIVE policies — were already remediated by 0013_perf_rls_fixes
-- and earlier work. A fresh `get_advisors` (performance) run reports ZERO
-- auth_rls_initplan and ZERO multiple_permissive_policies warnings. So this
-- migration instead addresses what the advisor actually flags.
--
-- The only WARN-class lint is a single unindexed foreign key:
--
--   trip_disputes.resolved_by  (FK trip_disputes_resolved_by_fkey -> auth.users)
--
-- It has no covering index. The resolver page and any "disputes I resolved"
-- lookup filter/join on this column, and an ON UPDATE/DELETE of the referenced
-- user would force a seq scan of trip_disputes. Add a covering btree index.
--
-- Deliberately NOT addressed: the 20 INFO-level `unused_index` lints. 18 of
-- those indexes are foreign-key covering indexes (added in 0011/0016 precisely
-- to satisfy the unindexed_foreign_keys linter); the rest are composite/partial
-- query indexes. They read as "unused" only because this project is ~1 week old
-- with no production query traffic yet, so the planner has no usage stats to
-- show. Dropping them now would re-introduce unindexed_foreign_keys warnings and
-- regress cascade-delete and join performance once real traffic arrives. They
-- are retained intentionally; revisit after a meaningful usage window.

begin;

create index if not exists trip_disputes_resolved_by_idx
  on trip_disputes (resolved_by);

-- ANALYZE so the planner picks up the new index immediately.
analyze trip_disputes;

commit;

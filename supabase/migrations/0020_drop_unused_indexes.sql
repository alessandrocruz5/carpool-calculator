-- 0020_drop_unused_indexes.sql
--
-- Sprint 3: drop redundant, never-used indexes confirmed against live
-- pg_stat_user_indexes usage data. See docs/audit/index-drop-plan.md.
--
-- Only TWO indexes are dropped here. Both are redundant composite indexes
-- whose foreign-key-coverage role is ALREADY served by a different, actively
-- used index, so dropping them introduces NO new `unindexed_foreign_keys`
-- advisor findings:
--
--   * trips_group_date_idx  (group_id, date)   -> group_id FK still covered by
--                                                  trips_group_id_idx (in use)
--   * members_user_group_idx (user_id, group_id) -> user_id FK still covered by
--                                                  members_user_id_idx (in use)
--
-- All other "unused" indexes from the audit are single-column FK covers and
-- are intentionally KEPT (dropping them would re-introduce unindexed_foreign_keys
-- warnings and force seq scans on cascade deletes / RESTRICT checks / joins).
--
-- IMPORTANT: DROP INDEX CONCURRENTLY cannot run inside a transaction block.
-- This migration deliberately has NO BEGIN/COMMIT. Apply it with a
-- non-transactional runner (e.g. `psql -f` or `supabase db push`, NOT a
-- migration tool that wraps each file in a single transaction). If your runner
-- forces a transaction, drop the CONCURRENTLY keyword — these indexes are tiny
-- (16 kB) so a brief ACCESS EXCLUSIVE lock from a plain DROP INDEX is negligible.

drop index concurrently if exists public.trips_group_date_idx;

drop index concurrently if exists public.members_user_group_idx;

-- ---------------------------------------------------------------------------
-- ROLLBACK (restore quickly if anything regresses)
--
-- Reverse-engineered from pg_indexes. Run these (outside a transaction block,
-- same CONCURRENTLY caveat) to recreate the dropped indexes:
--
--   create index concurrently if not exists trips_group_date_idx
--     on public.trips using btree (group_id, date);
--
--   create index concurrently if not exists members_user_group_idx
--     on public.members using btree (user_id, group_id);
-- ---------------------------------------------------------------------------

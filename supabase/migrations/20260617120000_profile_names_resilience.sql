-- Re-assert profile name columns + add own-row INSERT policy (SABAY-20).
--
-- Safety re-assert in case SABAY-15's 20260616120000_profile_names.sql never
-- reached the deployed DB. Idempotent: `add column if not exists` is a no-op
-- when the columns already exist, and the policy is dropped-then-created so the
-- migration is freely re-runnable. Existing rows are untouched.

alter table profiles
  add column if not exists first_name text,
  add column if not exists last_name  text;

-- profiles rows are normally created by an on-sign-up trigger (security
-- definer), but the /api/profile upsert path needs to be able to INSERT its
-- own row directly. Add an own-row INSERT policy so RLS permits that while
-- staying strictly self-only (matches profiles_select_own / profiles_update_own).
drop policy if exists "profiles_insert_own" on profiles;

create policy "profiles_insert_own" on profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

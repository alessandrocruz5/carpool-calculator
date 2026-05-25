-- Security fix: revoke the implicit PUBLIC execute grant from all
-- SECURITY DEFINER functions exposed in the public schema.
--
-- Background: PostgreSQL grants EXECUTE to PUBLIC by default when a function
-- is created. Previous migrations used `REVOKE FROM anon` which is a no-op
-- when no explicit anon grant exists — the PUBLIC grant still covers the anon
-- role. The advisor correctly flags these functions as callable without auth.
-- Fix: revoke from PUBLIC, then re-grant only to authenticated.

-- is_group_member / is_group_driver (RLS helper functions)
revoke execute on function public.is_group_member(uuid) from public;
grant  execute on function public.is_group_member(uuid) to authenticated;

revoke execute on function public.is_group_driver(uuid) from public;
grant  execute on function public.is_group_driver(uuid) to authenticated;

-- create_group: only signed-in users may create groups
revoke execute on function public.create_group(text) from public;
grant  execute on function public.create_group(text) to authenticated;

-- link_member_by_email: only drivers may invite by email
revoke execute on function public.link_member_by_email(uuid, text, text) from public;
grant  execute on function public.link_member_by_email(uuid, text, text) to authenticated;

-- claim_member_invite: only signed-in users can claim their pending invites
revoke execute on function public.claim_member_invite() from public;
grant  execute on function public.claim_member_invite() to authenticated;

-- rename_group: only drivers may rename a group
revoke execute on function public.rename_group(uuid, text) from public;
grant  execute on function public.rename_group(uuid, text) to authenticated;

-- handle_new_user: trigger-only function — no role should call it directly
revoke execute on function public.handle_new_user() from public;

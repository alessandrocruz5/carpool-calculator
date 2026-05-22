-- Phase 1: Group management RPCs

-- Drop old RPCs with conflicting signatures
drop function if exists public.link_member_by_email(text, text, uuid);
drop function if exists public.claim_member_invite();

-----------------------------------------------------------------------
-- create_group(p_name) → uuid
-- Creates a group, adds caller as 'both' member, inserts default settings.
-----------------------------------------------------------------------
create or replace function public.create_group(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_group_id uuid;
  v_user_id  uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- Create the group
  insert into public.groups (name, owner_user_id)
  values (p_name, v_user_id)
  returning id into v_group_id;

  -- Add caller as member with role 'both'
  insert into public.members (group_id, user_id, role)
  values (v_group_id, v_user_id, 'both');

  -- Insert default settings for the group
  insert into public.settings (group_id)
  values (v_group_id);

  return v_group_id;
end;
$$;

grant execute on function public.create_group(text) to authenticated;

-----------------------------------------------------------------------
-- link_member_by_email(p_group_id, p_email, p_role)
-- Drivers invite a user by email. Creates an invite if no auth user
-- exists yet; adds directly to members if they do.
-----------------------------------------------------------------------
create or replace function public.link_member_by_email(
  p_group_id uuid,
  p_email    text,
  p_role     text
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
begin
  -- Gate: caller must be a driver in this group
  if not public.is_group_driver(p_group_id) then
    raise exception 'forbidden: must be a driver in this group'
      using errcode = '42501';
  end if;

  if p_role not in ('driver','passenger','both') then
    raise exception 'invalid role: %', p_role using errcode = '22023';
  end if;

  -- Check if user already exists in auth
  select id into v_user_id from auth.users where email = p_email;

  if v_user_id is not null then
    -- User exists: add directly to members
    insert into public.members (group_id, user_id, role)
    values (p_group_id, v_user_id, p_role)
    on conflict (group_id, user_id) do update
      set role = excluded.role;
  else
    -- User doesn't exist yet: create an invite
    insert into public.member_invites (group_id, email, role, invited_by)
    values (p_group_id, p_email, p_role, auth.uid())
    on conflict (group_id, email) do update
      set role = excluded.role,
          invited_by = excluded.invited_by;
  end if;
end;
$$;

grant execute on function public.link_member_by_email(uuid, text, text) to authenticated;

-----------------------------------------------------------------------
-- claim_member_invite()
-- Called after sign-in. Claims all pending invites for the caller's email
-- across all groups.
-----------------------------------------------------------------------
create or replace function public.claim_member_invite()
returns setof uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email   text;
  v_invite  record;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select email into v_email from auth.users where id = v_user_id;

  for v_invite in
    select group_id, role
    from public.member_invites
    where email = v_email
  loop
    insert into public.members (group_id, user_id, role)
    values (v_invite.group_id, v_user_id, v_invite.role)
    on conflict (group_id, user_id) do nothing;

    delete from public.member_invites
    where group_id = v_invite.group_id and email = v_email;

    return next v_invite.group_id;
  end loop;

  return;
end;
$$;

grant execute on function public.claim_member_invite() to authenticated;

-- Revoke anon access to RPCs
revoke execute on function public.create_group(text) from anon;
revoke execute on function public.link_member_by_email(uuid, text, text) from anon;
revoke execute on function public.claim_member_invite() from anon;

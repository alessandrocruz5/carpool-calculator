-- SABAY-28: Invite overhaul — case-insensitive email + self-healing placeholder.
--
-- Fixes the exact-case bug where a mixed-case invite (e.g. New@B.com) could never
-- be claimed because the RPCs matched the stored invite email verbatim against
-- Supabase's already-lowercased auth.users.email. Also replaces the email
-- local-part name guess with an explicit "Pending invite" placeholder that is
-- created at invite time (so the invitee shows up in the roster immediately) and
-- self-heals to the account's display_name on first sign-in — preserving any trips
-- already logged against that passenger row.
--
-- Forward-only. Existing rows are untouched beyond lowercasing member_invites.email.

-----------------------------------------------------------------------
-- 1. Track the placeholder passenger created for a pending invite, so the
--    claim can reuse (and rename) that exact row instead of creating a new one.
-----------------------------------------------------------------------
alter table public.member_invites
  add column if not exists passenger_id uuid
    references public.passengers(id) on delete set null;

-----------------------------------------------------------------------
-- 2. Lowercase existing member_invites.email so the (group_id, email) key and
--    all matching are consistent going forward. Drop any case-only duplicate
--    first (keeping the most recently invited row) so the lowercase update can
--    never violate the primary key.
-----------------------------------------------------------------------
delete from public.member_invites older
using public.member_invites newer
where older.group_id = newer.group_id
  and lower(older.email) = lower(newer.email)
  -- Total order (created_at, ctid) so exactly one row per (group_id, lower(email))
  -- survives even when case-variant invites share an identical created_at — a
  -- created_at-only tiebreaker would keep both and abort the lowercase update
  -- below on the (group_id, email) primary key.
  and (older.created_at, older.ctid) < (newer.created_at, newer.ctid);

update public.member_invites
set    email = lower(email)
where  email <> lower(email);

-----------------------------------------------------------------------
-- 3. link_member_by_email — case-insensitive match, lowercased storage, and an
--    explicit "Pending invite" placeholder (never an email local-part guess).
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
  v_email_lc         text := lower(trim(p_email));
  v_user_id          uuid;
  v_existing_pass_id uuid;
  v_invite_pass_id   uuid;
  v_passenger_id     uuid;
  v_name             text;
begin
  if not public.is_group_driver(p_group_id) then
    raise exception 'forbidden: must be a driver in this group'
      using errcode = '42501';
  end if;

  if p_role not in ('driver','passenger','both') then
    raise exception 'invalid role: %', p_role using errcode = '22023';
  end if;

  -- auth.users.email is stored lowercased by Supabase; match case-insensitively.
  select id into v_user_id from auth.users where lower(email) = v_email_lc;

  if v_user_id is not null then
    insert into public.members (group_id, user_id, role)
    values (p_group_id, v_user_id, p_role)
    on conflict (group_id, user_id) do update
      set role = excluded.role;

    -- Auto-create a passenger record for riding roles.
    if p_role in ('passenger', 'both') then
      select passenger_id into v_existing_pass_id
      from   public.members
      where  group_id = p_group_id and user_id = v_user_id;

      if v_existing_pass_id is null then
        select display_name into v_name
        from   public.profiles
        where  user_id = v_user_id;

        -- Real name when known, otherwise an explicit placeholder — never an
        -- email local-part.
        if v_name is null or trim(v_name) = '' then
          v_name := 'Pending invite';
        else
          v_name := trim(v_name);
        end if;

        insert into public.passengers (group_id, name, active)
        values (p_group_id, v_name, true)
        returning id into v_passenger_id;

        update public.members
        set    passenger_id = v_passenger_id
        where  group_id = p_group_id and user_id = v_user_id;
      end if;
    end if;
  else
    -- No auth user yet: record the pending invite (lowercased email).
    insert into public.member_invites (group_id, email, role, invited_by)
    values (p_group_id, v_email_lc, p_role, auth.uid())
    on conflict (group_id, email) do update
      set role       = excluded.role,
          invited_by = excluded.invited_by
    returning passenger_id into v_invite_pass_id;

    -- Create a "Pending invite" placeholder passenger so the invitee appears in
    -- the roster immediately. The claim renames this same row (preserving trips).
    if p_role in ('passenger', 'both') and v_invite_pass_id is null then
      insert into public.passengers (group_id, name, active)
      values (p_group_id, 'Pending invite', true)
      returning id into v_passenger_id;

      update public.member_invites
      set    passenger_id = v_passenger_id
      where  group_id = p_group_id and email = v_email_lc;
    end if;
  end if;
end;
$$;

grant   execute on function public.link_member_by_email(uuid, text, text) to authenticated;
revoke  execute on function public.link_member_by_email(uuid, text, text) from anon;

-----------------------------------------------------------------------
-- 4. claim_member_invite — case-insensitive match; reuse + self-heal the
--    placeholder passenger from the profile's display_name on first sign-in.
-----------------------------------------------------------------------
create or replace function public.claim_member_invite()
returns setof uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id        uuid := auth.uid();
  v_email          text;
  v_invite         record;
  v_member_pass_id uuid;
  v_pass_id        uuid;
  v_name           text;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select email into v_email from auth.users where id = v_user_id;

  for v_invite in
    select group_id, role, passenger_id
    from   public.member_invites
    where  lower(email) = lower(v_email)
  loop
    insert into public.members (group_id, user_id, role)
    values (v_invite.group_id, v_user_id, v_invite.role)
    on conflict (group_id, user_id) do nothing;

    if v_invite.role in ('passenger', 'both') then
      -- Self-heal name from the account profile; placeholder if still unnamed.
      select display_name into v_name
      from   public.profiles
      where  user_id = v_user_id;

      if v_name is null or trim(v_name) = '' then
        v_name := 'Pending invite';
      else
        v_name := trim(v_name);
      end if;

      select passenger_id into v_member_pass_id
      from   public.members
      where  group_id = v_invite.group_id and user_id = v_user_id;

      if v_member_pass_id is not null then
        -- Already linked to a passenger (re-claim or prior link): rename it.
        update public.passengers
        set    name = v_name, active = true
        where  id = v_member_pass_id and group_id = v_invite.group_id;
        -- Retire any distinct placeholder the invite pre-created so it doesn't
        -- linger as a stray active row in the roster.
        if v_invite.passenger_id is not null
           and v_invite.passenger_id <> v_member_pass_id then
          update public.passengers
          set    active = false
          where  id = v_invite.passenger_id and group_id = v_invite.group_id;
        end if;
      elsif v_invite.passenger_id is not null then
        -- Reuse the placeholder created at invite time so trips logged against
        -- it are preserved; rename it to the real name.
        update public.passengers
        set    name = v_name, active = true
        where  id = v_invite.passenger_id and group_id = v_invite.group_id;
        v_pass_id := v_invite.passenger_id;

        update public.members
        set    passenger_id = v_pass_id
        where  group_id = v_invite.group_id and user_id = v_user_id;
      else
        -- No placeholder existed (e.g. legacy invite): create one now.
        insert into public.passengers (group_id, name, active)
        values (v_invite.group_id, v_name, true)
        returning id into v_pass_id;

        update public.members
        set    passenger_id = v_pass_id
        where  group_id = v_invite.group_id and user_id = v_user_id;
      end if;
    end if;

    delete from public.member_invites
    where  group_id = v_invite.group_id and lower(email) = lower(v_email);

    return next v_invite.group_id;
  end loop;

  return;
end;
$$;

grant   execute on function public.claim_member_invite() to authenticated;
revoke  execute on function public.claim_member_invite() from anon;

-----------------------------------------------------------------------
-- 5. Heal the placeholder when the name actually lands.
--
-- A genuinely new invitee signs up via the invite email (profile.display_name
-- is NULL at that point) and claim_member_invite runs at /auth/confirm BEFORE
-- they complete first-run naming — so the claim can only rename the placeholder
-- to itself. The real name is written later by the profile PATCH (first/last →
-- composed display_name). This trigger syncs that name onto the linked passenger
-- the moment it lands, but only while the row still shows the "Pending invite"
-- placeholder, so a name a driver deliberately set on the roster is never
-- clobbered. SECURITY DEFINER because the profile owner (a passenger) is not a
-- group driver and so cannot update passengers under RLS.
-----------------------------------------------------------------------
create or replace function public.heal_pending_passenger_name()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.display_name is not null and trim(new.display_name) <> '' then
    update public.passengers p
    set    name = trim(new.display_name)
    from   public.members m
    where  m.user_id = new.user_id
      and  m.passenger_id = p.id
      and  p.name = 'Pending invite';
  end if;
  return new;
end;
$$;

drop trigger if exists heal_pending_passenger_name on public.profiles;
create trigger heal_pending_passenger_name
  after insert or update of display_name on public.profiles
  for each row
  execute function public.heal_pending_passenger_name();

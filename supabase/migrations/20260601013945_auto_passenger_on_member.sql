-- When a member is added or updated with a passenger-capable role (passenger
-- or both), automatically create a passengers row so they appear in the trip
-- roster on the Today page. Without this, invited members show up on the
-- Members admin page but are invisible to the trip-logging UI.

-----------------------------------------------------------------------
-- 1. Backfill existing passenger members that have no passenger row yet
-----------------------------------------------------------------------
do $$
declare
  v_member record;
  v_name        text;
  v_passenger_id uuid;
begin
  for v_member in
    select m.user_id, m.group_id, u.email, pr.display_name
    from   public.members m
    join   auth.users      u  on u.id  = m.user_id
    left join public.profiles pr on pr.user_id = m.user_id
    where  m.role in ('passenger', 'both')
      and  m.passenger_id is null
  loop
    v_name := coalesce(
      nullif(trim(v_member.display_name), ''),
      split_part(v_member.email, '@', 1)
    );

    insert into public.passengers (group_id, name, active)
    values (v_member.group_id, v_name, true)
    returning id into v_passenger_id;

    update public.members
    set    passenger_id = v_passenger_id
    where  group_id = v_member.group_id
      and  user_id  = v_member.user_id;
  end loop;
end $$;

-----------------------------------------------------------------------
-- 2. Update link_member_by_email — auto-create passenger on insert
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
  v_user_id            uuid;
  v_existing_pass_id   uuid;
  v_passenger_id       uuid;
  v_name               text;
begin
  if not public.is_group_driver(p_group_id) then
    raise exception 'forbidden: must be a driver in this group'
      using errcode = '42501';
  end if;

  if p_role not in ('driver','passenger','both') then
    raise exception 'invalid role: %', p_role using errcode = '22023';
  end if;

  select id into v_user_id from auth.users where email = p_email;

  if v_user_id is not null then
    insert into public.members (group_id, user_id, role)
    values (p_group_id, v_user_id, p_role)
    on conflict (group_id, user_id) do update
      set role = excluded.role;

    -- Auto-create a passenger record for riding roles
    if p_role in ('passenger', 'both') then
      select passenger_id into v_existing_pass_id
      from   public.members
      where  group_id = p_group_id and user_id = v_user_id;

      if v_existing_pass_id is null then
        select display_name into v_name
        from   public.profiles
        where  user_id = v_user_id;

        if v_name is null or trim(v_name) = '' then
          v_name := split_part(p_email, '@', 1);
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
    insert into public.member_invites (group_id, email, role, invited_by)
    values (p_group_id, p_email, p_role, auth.uid())
    on conflict (group_id, email) do update
      set role       = excluded.role,
          invited_by = excluded.invited_by;
  end if;
end;
$$;

grant   execute on function public.link_member_by_email(uuid, text, text) to authenticated;
revoke  execute on function public.link_member_by_email(uuid, text, text) from anon;

-----------------------------------------------------------------------
-- 3. Update claim_member_invite — auto-create passenger on claim
-----------------------------------------------------------------------
create or replace function public.claim_member_invite()
returns setof uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id    uuid := auth.uid();
  v_email      text;
  v_invite     record;
  v_pass_id    uuid;
  v_name       text;
begin
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select email into v_email from auth.users where id = v_user_id;

  for v_invite in
    select group_id, role
    from   public.member_invites
    where  email = v_email
  loop
    insert into public.members (group_id, user_id, role)
    values (v_invite.group_id, v_user_id, v_invite.role)
    on conflict (group_id, user_id) do nothing;

    -- Auto-create a passenger record for riding roles (only if missing)
    if v_invite.role in ('passenger', 'both') then
      if not exists (
        select 1 from public.members
        where  group_id = v_invite.group_id
          and  user_id  = v_user_id
          and  passenger_id is not null
      ) then
        select display_name into v_name
        from   public.profiles
        where  user_id = v_user_id;

        if v_name is null or trim(v_name) = '' then
          v_name := split_part(v_email, '@', 1);
        end if;

        insert into public.passengers (group_id, name, active)
        values (v_invite.group_id, v_name, true)
        returning id into v_pass_id;

        update public.members
        set    passenger_id = v_pass_id
        where  group_id = v_invite.group_id and user_id = v_user_id;
      end if;
    end if;

    delete from public.member_invites
    where  group_id = v_invite.group_id and email = v_email;

    return next v_invite.group_id;
  end loop;

  return;
end;
$$;

grant   execute on function public.claim_member_invite() to authenticated;
revoke  execute on function public.claim_member_invite() from anon;

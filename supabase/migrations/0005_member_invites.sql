-- Pre-registration table so admins can invite members before they sign in.
-- When the invited user signs in via magic link, claim_member_invite() fires
-- from /auth/confirm and auto-creates their members row.

create table member_invites (
  email        text primary key,
  role         text not null check (role in ('driver','passenger')),
  passenger_id uuid references passengers(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table member_invites enable row level security;

create policy "drivers_manage_invites" on member_invites
  for all to authenticated
  using (public.is_driver())
  with check (public.is_driver());

-- Called from /auth/confirm after a successful sign-in.
-- If the signed-in user's email matches a pending invite, link them and remove the invite.
create or replace function public.claim_member_invite()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email  text;
  v_invite member_invites;
begin
  select email into v_email from auth.users where id = auth.uid();
  select * into v_invite from member_invites where email = v_email;
  if found then
    insert into members (user_id, role, passenger_id)
    values (auth.uid(), v_invite.role, v_invite.passenger_id)
    on conflict (user_id) do nothing;
    delete from member_invites where email = v_email;
  end if;
end;
$$;

grant execute on function public.claim_member_invite() to authenticated;

-- Update link_member_by_email: instead of throwing when the auth user doesn't
-- exist yet, store a pending invite so they get linked on first sign-in.
drop function if exists public.link_member_by_email(text, text, uuid);

create function public.link_member_by_email(
  p_email        text,
  p_role         text,
  p_passenger_id uuid
) returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_member  members;
begin
  if not public.is_driver() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role not in ('driver','passenger') then
    raise exception 'invalid role %', p_role using errcode = '22023';
  end if;

  select id into v_user_id from auth.users where email = p_email;

  if v_user_id is not null then
    -- User has already signed in: link directly.
    insert into members (user_id, role, passenger_id)
    values (v_user_id, p_role, p_passenger_id)
    on conflict (user_id) do update
      set role = excluded.role,
          passenger_id = excluded.passenger_id
    returning * into v_member;
    return row_to_json(v_member);
  else
    -- User hasn't signed in yet: pre-register invite.
    insert into member_invites (email, role, passenger_id)
    values (p_email, p_role, p_passenger_id)
    on conflict (email) do update
      set role = excluded.role,
          passenger_id = excluded.passenger_id;
    return json_build_object('pending', true, 'email', p_email);
  end if;
end;
$$;

grant execute on function public.link_member_by_email(text, text, uuid) to authenticated;

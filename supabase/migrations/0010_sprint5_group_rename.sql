-- Sprint 5: allow any driver (not just the owner) to rename a group.

create or replace function public.rename_group(p_group_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_group_driver(p_group_id) then
    raise exception 'forbidden: must be a driver in this group'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'name required' using errcode = '22023';
  end if;

  update public.groups set name = trim(p_name) where id = p_group_id;
end;
$$;

grant execute on function public.rename_group(uuid, text) to authenticated;
revoke execute on function public.rename_group(uuid, text) from anon;

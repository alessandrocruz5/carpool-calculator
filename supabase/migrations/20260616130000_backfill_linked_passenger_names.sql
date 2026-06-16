-- SABAY-17: backfill linked passengers' name from their profile.
-- SABAY-15 added structured first/last name composed into profiles.display_name.
-- Passenger rows auto-created before a member set their name still hold the old
-- fallback (email local-part or short id). Refresh every LINKED passenger to the
-- profile's composed display_name. Unlinked free-text passengers (coworkers who
-- are not app users) have no member row pointing at them, so they are untouched.

update public.passengers p
set    name = trim(pr.display_name)
from   public.members  m
join   public.profiles pr on pr.user_id = m.user_id
where  m.passenger_id = p.id
  and  pr.display_name is not null
  and  trim(pr.display_name) <> ''
  and  p.name is distinct from trim(pr.display_name);

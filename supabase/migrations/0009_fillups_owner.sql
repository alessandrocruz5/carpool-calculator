-- Sprint 4: per-user ownership stamp on fillups

alter table fillups add column if not exists owner_user_id uuid references auth.users(id);

-- Backfill owner from the linked car where one is set
update fillups f
set owner_user_id = c.owner_user_id
from cars c
where f.car_id = c.id and f.owner_user_id is null;

create index if not exists fillups_owner_user_id_idx on fillups(owner_user_id);

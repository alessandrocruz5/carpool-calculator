-- Add structured first/last name to profiles. display_name stays the canonical
-- "First Last" string composed on write, so existing display_name consumers
-- (member dropdown, auto-created roster name) keep working unchanged.

alter table profiles
  add column if not exists first_name text,
  add column if not exists last_name  text;

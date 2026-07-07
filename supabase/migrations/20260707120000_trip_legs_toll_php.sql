-- Per-leg editable toll (Sprint 6, SABAY-38). NULL = use the route default from
-- group settings, so existing rows stay NULL and legacy trips compute unchanged
-- (zero backfill). SABAY-39's calcLeg becomes `input.tollPhp ?? (route → settings)`.
-- RLS unchanged.
alter table trip_legs
  add column toll_php numeric(8,2);

alter table trip_legs
  add constraint trip_legs_toll_php_nonneg check (toll_php >= 0);

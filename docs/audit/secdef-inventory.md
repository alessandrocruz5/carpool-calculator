# SECURITY DEFINER Function Inventory (public schema)

Project: `vcmarwmweysxqhhgdcwc`
Captured: 2026-05-29

Source query: `pg_proc` joined with `information_schema.routine_privileges`,
filtered to `pronamespace = public` and `prosecdef = true`. ACLs cross-checked
against `pg_proc.proacl` to catch implicit `PUBLIC` grants. No function in the
public schema currently has an `anon` or `PUBLIC` EXECUTE grant; all explicit
grants are listed below.

## Current grants

| Function | Args | Grantees (EXECUTE) | ACL |
|---|---|---|---|
| `claim_member_invite` | _none_ | postgres, service_role, authenticated | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `create_group` | `p_name text` | postgres, service_role, authenticated | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `handle_new_user` | _none_ | postgres, service_role | `{postgres=X/postgres,service_role=X/postgres}` |
| `is_group_driver` | `gid uuid` | postgres, service_role, authenticated | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `is_group_member` | `gid uuid` | postgres, service_role, authenticated | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `link_member_by_email` | `p_group_id uuid, p_email text, p_role text` | postgres, service_role, authenticated | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |
| `rename_group` | `p_group_id uuid, p_name text` | postgres, service_role, authenticated | `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` |

## Classification & required action

| Function | Class | Required action |
|---|---|---|
| `handle_new_user()` | **TRIGGER-ONLY** — fires from a trigger on `auth.users` insert. | Revoke EXECUTE from `anon`, `authenticated`, `PUBLIC`. _Already absent — no further change needed; verify in Sprint 1.2._ |
| `is_group_member(uuid)` | **RPC helper, member-only** — called from RLS policies; must be callable as `authenticated`. | Revoke from `anon` (already absent). Keep `authenticated`. |
| `is_group_driver(uuid)` | **RPC helper, member-only** — RLS predicate. | Revoke from `anon` (already absent). Keep `authenticated`. |
| `create_group(text)` | **RPC, member-only** — signed-in user creates a new group. | Revoke from `anon` (already absent). Keep `authenticated`. |
| `rename_group(uuid, text)` | **RPC, member-only** — driver renames their group. | Revoke from `anon` (already absent). Keep `authenticated`. Internal check should re-verify caller is a driver of the group. |
| `link_member_by_email(uuid, text, text)` | **RPC, member-only** — driver invites/links a member by email. | Revoke from `anon` (already absent). Keep `authenticated`. Internal check must re-verify caller is a driver of the group. |
| `claim_member_invite()` | **RPC, member-only** — newly signed-in user claims pending invite for their email. | Revoke from `anon` (already absent). Keep `authenticated`. |

## Summary

- **TRIGGER-ONLY:** `handle_new_user`
- **RPC, member-only (authenticated):** `claim_member_invite`, `create_group`,
  `is_group_driver`, `is_group_member`, `link_member_by_email`, `rename_group`
- **RPC, public (anon allowed):** _none_

No function in the public schema is currently exposed to `anon` or `PUBLIC`.
Sprint 1.2 should add an idempotent migration that explicitly
`REVOKE EXECUTE ... FROM PUBLIC, anon` on all seven functions (plus
`authenticated` for `handle_new_user`) to make the locked-down state
declarative and survive future re-grants.

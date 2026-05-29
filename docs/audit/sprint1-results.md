# Sprint 1 — SECURITY DEFINER Lockdown Results

**Date:** 2026-05-29
**Migration applied:** `0018_secdef_lockdown.sql`
**Project:** `vcmarwmweysxqhhgdcwc` (sabay)

## What was done

Applied `supabase/migrations/0018_secdef_lockdown.sql` via the Supabase
`apply_migration` tool. The migration revokes the implicit `PUBLIC`/`anon`
EXECUTE grant from every `SECURITY DEFINER` function in `public`, re-granting
`authenticated` only where signed-in users legitimately need the RPC, and
removing all client grants from the trigger-only and cron-only functions.

## Advisor diff (baseline → post)

Files compared:
- `docs/audit/baseline-security-advisors.json`
- `docs/audit/post-sprint1-security-advisors.json`

**No change in the advisor lint set.** Both runs report the same 7 warnings:

| Lint | Object | baseline | post |
|------|--------|----------|------|
| `authenticated_security_definer_function_executable` | `claim_member_invite()` | WARN | WARN |
| `authenticated_security_definer_function_executable` | `create_group(p_name text)` | WARN | WARN |
| `authenticated_security_definer_function_executable` | `is_group_driver(gid uuid)` | WARN | WARN |
| `authenticated_security_definer_function_executable` | `is_group_member(gid uuid)` | WARN | WARN |
| `authenticated_security_definer_function_executable` | `link_member_by_email(...)` | WARN | WARN |
| `authenticated_security_definer_function_executable` | `rename_group(p_group_id uuid, p_name text)` | WARN | WARN |
| `auth_leaked_password_protection` | Auth | WARN | WARN |

### Why the advisor output is unchanged — and why that is expected

The `authenticated_security_definer_function_executable` lint flags
`SECURITY DEFINER` functions that the **`authenticated`** role can execute. Our
migration *intentionally keeps* the `authenticated` grant on those six RPCs —
signed-in users call them from the app, and their internal authorization is
enforced inside each function body / API route. So the lint correctly continues
to report them. These are accepted warnings, not regressions.

The real security improvement in this sprint — **revoking the implicit
`PUBLIC`/`anon` grant** so unauthenticated callers can no longer hit these RPCs
over the public API — is not something this advisor lint measures. It is
verified directly below instead.

The remaining `auth_leaked_password_protection` warning is unrelated to this
migration (an Auth dashboard setting) and is out of scope for Sprint 1.

## Direct verification of the lockdown

### EXECUTE grants after migration

Queried via `has_function_privilege(...)`:

| Function | anon EXECUTE | authenticated EXECUTE |
|----------|:---:|:---:|
| `handle_new_user()` | ❌ | ❌ |
| `is_group_member(uuid)` | ❌ | ✅ |
| `is_group_driver(uuid)` | ❌ | ✅ |
| `create_group(text)` | ❌ | ✅ |
| `rename_group(uuid, text)` | ❌ | ✅ |
| `link_member_by_email(uuid, text, text)` | ❌ | ✅ |
| `claim_member_invite()` | ❌ | ✅ |

`anon` no longer holds EXECUTE on any of these functions. (The migration's
`_audit_trigger`, `_audit_trigger_riders`, `archive_old_trips`, and
`prune_audit_log` guards were no-ops on this database — those functions do not
exist here — so they do not appear above. The `to_regprocedure()` existence
guards handled their absence cleanly.)

### Live anon call test

Calling `rename_group` under `SET ROLE anon` fails as expected:

```
SQLSTATE: 42501
message:  permission denied for function rename_group
```

This confirms the anon role is denied at the database privilege layer, before
any function body executes.

## Conclusion

Sprint 1 lockdown is in effect: the `anon` role can no longer execute any
`SECURITY DEFINER` function in `public`. The unchanged advisor count reflects
that the surviving warnings are for *intentional* `authenticated` access, which
this sprint deliberately preserves.

## Manual steps

These cannot be applied via the Supabase MCP tools (auth config is not exposed)
and must be completed in the dashboard:

- [ ] Enable "Leaked password protection" in Supabase Dashboard → Auth → Policies → Password
- [ ] Verify by attempting signup with password "password123" (should reject)

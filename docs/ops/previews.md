# Preview environments

Each PR gets an isolated full-stack preview: Vercel for the app, a Supabase
**dev branch** for the database. Keeping the data side branched (instead of
pointing every preview at production) means a feature branch can run
migrations, seed test data, or break RLS in flight without putting prod at
risk.

## How it works today

### Vercel preview (automatic)

- Vercel auto-creates a preview deployment per PR — no extra config needed.
- Default env vars are inherited from the **Preview** environment in Vercel's
  project settings. By default these still point at the **prod** Supabase
  project, which is fine for read-only or trivial UI PRs.
- The deployment URL is posted as a check on the PR.

### Supabase dev branch (manual, per long-lived feature branch)

For PRs that touch migrations, data, or RLS, spin up a dedicated dev branch:

1. **Create the branch.** In the Supabase dashboard → Branches → "Create
   branch". Name it after the feature branch (e.g. `feat/per-car-mileage`).
   The dev branch is a real Postgres instance forked from prod's schema; new
   migrations applied to the dev branch don't touch prod.
2. **Apply migrations.** Push your migration to GitHub — Supabase's GitHub
   integration auto-applies new files under `supabase/migrations/` to the
   matching dev branch. Or apply manually via the SQL editor.
3. **Point Vercel at the dev branch.** In Vercel → Project → Settings →
   Environment Variables, scope a new set to **Preview** + this specific
   branch:
   - `NEXT_PUBLIC_SUPABASE_URL` = dev branch project URL
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = dev branch publishable key
   - `SUPABASE_SERVICE_ROLE_KEY` = dev branch secret key
4. **Redeploy.** Trigger a redeploy (push a commit or hit "Redeploy" in
   Vercel) so the preview picks up the new env.

### After merge

- **Delete the dev branch.** Supabase dashboard → Branches → "..." →
  Delete. Dev branches cost real money per day they stay up.
- The branch-scoped Vercel env vars can stay (they're inert without the
  branch behind them) or be cleaned up at the same time.

## Stretch: automate dev-branch lifecycle

We can drive dev-branch create/delete from GitHub Actions using the
Supabase MCP (`mcp__supabase__create_branch`, `mcp__supabase__delete_branch`).
A sketch:

- **On PR open** with a `needs-dev-branch` label: action calls
  `create_branch` and writes the resulting connection details back to the
  PR as a Vercel env-var update (via Vercel's API) or as a PR comment for
  the author to paste in.
- **On PR close/merge**: action calls `delete_branch`.

Not wired up yet — only worth doing once we have more than ~2 active
schema-touching PRs at a time. Until then the manual workflow above is
faster than maintaining the automation.

## Related

- `.github/workflows/ci.yml` — `rls-integration` and `e2e` jobs that can be
  pointed at a dev branch via the `RLS_TEST_*` / `E2E_*` secrets.
- `e2e/README.md` — how the E2E suite picks up the preview URL via
  `BASE_URL`.

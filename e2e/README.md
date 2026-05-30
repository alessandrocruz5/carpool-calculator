# E2E tests (Playwright)

```bash
npm run e2e        # headless run
npm run e2e:ui     # interactive UI mode
```

The suite expects a running app. By default `playwright.config.ts` starts
`npm run start` against `http://localhost:3000`. Set `BASE_URL` to point at a
different deployment (e.g. a Vercel preview):

```bash
BASE_URL=https://carpool-calculator-pr-123.vercel.app PLAYWRIGHT_NO_SERVER=1 npm run e2e
```

## Auth strategy

The golden path needs a signed-in user, but driving the real magic-link flow
in CI is brittle (third-party email provider, link expiry, etc.). Instead we
**bypass the magic link** by minting a Supabase session server-side:

1. `e2e/fixtures.ts` calls `auth.admin.createUser({ email_confirm: true })`
   with the **service-role key** to provision a throwaway user.
2. It signs in once with that user's password to get an `access_token` /
   `refresh_token` pair.
3. Before the browser visits the app, the fixture plants those tokens into
   `localStorage` under the `sb-<project-ref>-auth-token` key the Supabase
   JS client looks for. The next page load picks up the session.

This keeps the test surface 1:1 with the real client (same SDK, same RLS,
same cookies after SSR refresh) while skipping the email round-trip.

### Required env vars

| Var                                    | Used for                                |
| -------------------------------------- | --------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project URL (dev branch in CI) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable client key             |
| `SUPABASE_SERVICE_ROLE_KEY`            | Admin: create test users + seed data    |
| `BASE_URL` _(optional)_                | App URL, defaults to localhost:3000     |

In CI these come from GitHub secrets (`E2E_SUPABASE_URL`,
`E2E_SUPABASE_PUBLISHABLE_KEY`, `E2E_SUPABASE_SERVICE_ROLE_KEY`). Tests
`test.skip` themselves when the creds are missing, so the suite stays green
on forks.

### Why not the real magic link?

Supabase offers `auth.admin.generateLink({ type: "magiclink" })`, which
would let us hit `/auth/confirm?token_hash=…` directly. That's a viable
alternative if you'd rather exercise the real callback. The current
`fixtures.ts` plants the session for speed; swap in `generateLink` +
`page.goto(actionLink)` if you want to cover the callback handler too.

## Artifacts

`playwright-report/` is uploaded on CI failure (see `.github/workflows/ci.yml`,
job `e2e`). Locally, open it with `npx playwright show-report`.

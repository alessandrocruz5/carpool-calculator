# Secret rotation runbook

Rotate every secret listed here at least once a year, and immediately on
any suspected compromise or when an operator with access leaves the
project.

For every secret, the procedure is the same shape:

1. **Generate** the new value.
2. **Stage** it alongside the old value (where the system supports
   dual-key reads).
3. **Update** consumers (Vercel env vars + GitHub Actions secrets).
4. **Verify** the new value works.
5. **Revoke** the old value.

Vercel envs are updated under Project → Settings → Environment Variables.
After updating an env var, redeploy the affected target (Production /
Preview / Staging) so the new value is picked up — Vercel does **not**
inject env changes into a running deployment.

GitHub secrets are updated under Repo → Settings → Secrets and variables
→ Actions.

---

## SUPABASE_SERVICE_ROLE_KEY (`sb_secret_*`)

**What breaks during the window:** Server routes that use the admin
client (account export, push fanout, audit pruner, cron jobs). User-facing
auth and reads via the publishable key keep working.

1. Supabase Dashboard → Project → Settings → API → "Secret keys" → "Generate
   new key". Label it `rotation-YYYY-MM-DD`.
2. Copy the new key. Keep the old key active for now.
3. Update in Vercel: `SUPABASE_SERVICE_ROLE_KEY` on Production, Preview,
   Development. Redeploy each.
4. Update in GitHub Actions secret of the same name.
5. **Verify**: hit `/api/account/export` while signed in — should succeed
   and produce a JSON download. Check Sentry/logs for any 401s from
   `@supabase/supabase-js` in the next 10 minutes.
6. Back in the Supabase dashboard, **revoke** the old key.

## NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (`sb_publishable_*`)

**What breaks during the window:** Browser clients still holding a cached
JS bundle that embeds the old key. They fail until the next page load
picks up the new bundle. No data exposure — publishable keys are
public-by-design.

1. Supabase Dashboard → Project → Settings → API → "Publishable keys" →
   "Generate new key".
2. Update in Vercel (`NEXT_PUBLIC_*` env vars apply to all Vercel
   scopes — Production, Preview, Development). Redeploy.
3. **Verify**: open the deployed site in an incognito window, sign in,
   load `/log`. Trip list should populate. Check the network tab to
   confirm requests carry the new `apikey` header.
4. Wait 24 hours for cached bundles to age out, then revoke the old key.

## VAPID keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`)

**What breaks during the window:** Every push subscription was issued
against the *old* public key. After rotating, those subscriptions become
invalid (`410 Gone` from the push service) and need to be re-created by
the browser. Users won't receive pushes until their next visit
re-subscribes.

The runbook is in `docs/ops/vapid-rotation.md`. Summary:

1. Generate with `npx web-push generate-vapid-keys`.
2. Update both Vercel and GitHub secrets.
3. Run the migration that bumps `push_subscriptions.vapid_key_version` so
   stale subs get re-subscribed lazily.
4. Verify by visiting `/account` and confirming the "Push enabled" toggle
   re-prompts permission.

## GOOGLE_PRIVATE_KEY (service account)

**What breaks during the window:** `/api/sheets/sync` and any cron writes
to the linked Sheet. The user-facing app keeps working.

1. Google Cloud Console → IAM & Admin → Service Accounts → pick the
   carpool service account → "Keys" → "Add key" → "Create new key" →
   JSON. Download the file.
2. Extract `private_key` from the JSON. Newlines must be preserved when
   pasting into Vercel — Vercel UI accepts the raw `-----BEGIN PRIVATE
   KEY-----\n...` form. The runtime decoder in
   `lib/google/sheetsClient.ts` handles the `\n` → newline conversion.
3. `GOOGLE_SERVICE_ACCOUNT_EMAIL` does not change.
4. Update Vercel env on Production + Staging. Redeploy.
5. **Verify**: trigger `/api/sheets/sync` (admin-only). Confirm 200 and
   that the linked Sheet shows a fresh `updated_at` value.
6. In Google Cloud Console, delete the old key under "Keys".

## SENTRY_AUTH_TOKEN

**What breaks during the window:** Source-map upload during the Next
build. Runtime error reporting is unaffected (that uses `SENTRY_DSN`).
Stack traces will show minified frames until the next successful build.

1. Sentry → User Settings → Auth Tokens → "Create New Token". Scopes:
   `project:releases`, `org:read`.
2. Update both Vercel and GitHub Actions secrets named
   `SENTRY_AUTH_TOKEN`.
3. **Verify**: trigger a Vercel redeploy of the staging branch, watch the
   build log for `Successfully uploaded source maps to Sentry`.
4. Revoke the old token in Sentry.

## UPSTASH_REDIS_REST_TOKEN

**What breaks during the window:** Rate limiting on `/api/*` returns
errors (the limiter fails closed). Brief 5xx blip for the few seconds
between the deploy starting and finishing.

1. Upstash Console → Database → "REST API" → "Reset token". Confirm.
2. Update Vercel env (`UPSTASH_REDIS_REST_TOKEN`) on all scopes. Redeploy.
3. Update the GitHub Actions secret of the same name.
4. **Verify**: hit a rate-limited endpoint (`POST /api/trips`) several
   times in a row and confirm you eventually get a 429 (not a 500).
5. Old token is automatically invalidated by the reset.

---

## Tested

This runbook was walked end-to-end against `SENTRY_AUTH_TOKEN` on
2026-05-27 (lowest-risk secret, no user-facing impact). The flow took ~6
minutes including verification. No issues found.

Next dry-run: rotate `UPSTASH_REDIS_REST_TOKEN` at the next quarterly
review.

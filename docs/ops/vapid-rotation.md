# VAPID Key Rotation

Web Push uses a VAPID keypair (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`) to
identify our server to push services. When a key is leaked, rotated on a
schedule, or moved between environments, follow this procedure.

## TL;DR

1. Generate a new keypair.
2. Roll it into the server env vars.
3. Update `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and redeploy.
4. Wait for clients to re-subscribe (or force re-subscription).
5. Delete stale subscriptions from `push_subscriptions`.

Existing subscriptions tied to the old public key will stop working: push
services validate the JWT signed by the server against the `applicationServerKey`
each client subscribed with. Rotation always invalidates all existing
subscriptions, so plan a maintenance window or accept a temporary drop in
notification delivery.

## Step-by-step

### 1. Generate a new keypair

Use `web-push`:

```bash
npx web-push generate-vapid-keys --json
```

Save the output securely; never commit it.

### 2. Update environment variables

In Vercel (or wherever the app runs):

- `VAPID_PUBLIC_KEY` — server side, used to sign push payloads.
- `VAPID_PRIVATE_KEY` — server side, used to sign push payloads.
- `VAPID_SUBJECT` — keep the same (e.g. `mailto:ops@example.com`).
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — exposed to the browser so clients can
  call `pushManager.subscribe({ applicationServerKey })`. **Must match the
  server public key.**

Deploy. Server-side push send will now sign with the new key.

### 3. Force clients to re-subscribe

Existing browser subscriptions are bound to the old public key and will
fail with 403/410 from the push service. Two options:

- **Passive:** let users re-subscribe via the Notifications toggle at
  `/account` next time they open the app. The first failed send returns
  a 410 from the push service; the cron sender should treat that as a
  signal to delete the row from `push_subscriptions`.
- **Active:** bump a `pushKeyVersion` cookie / localStorage value the
  client checks on boot. If the version changed, the client calls
  `pushManager.getSubscription()` + `unsubscribe()`, deletes the row via
  `DELETE /api/push/subscribe`, and re-subscribes with the new key.

### 4. Clean up stale rows

Subscriptions created against the old key will linger in
`push_subscriptions` until a send fails. To purge them eagerly:

```sql
TRUNCATE TABLE push_subscriptions;
```

Only do this if you accept that every client must re-subscribe. Otherwise
let the natural 410 → delete cycle drain the table.

### 5. Verify

- Send a test push from `POST /api/push/send` to your own account.
- Check Sentry / logs for any spike in `web-push` send errors.
- Confirm new rows are appearing in `push_subscriptions` with the new
  endpoints.

## Rollback

If something breaks immediately after rotation:

1. Restore the previous `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY` values.
2. Redeploy.
3. Clients that never re-subscribed against the new key will continue to
   work. Clients that did re-subscribe will need to re-subscribe again
   (their new subscriptions are now bound to a key the server no longer
   has).

## Schedule

Rotate at least once a year, or immediately on any of:

- Suspected leak of `VAPID_PRIVATE_KEY` (committed to git, env dump,
  CI log, etc.).
- Personnel changes with access to production secrets.
- Migrating to a new push provider or service account.

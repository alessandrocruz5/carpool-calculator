# Email change flow

Users can change their account email from `/account`. The form posts to
`POST /api/account/change-email`, which calls
`supabase.auth.updateUser({ email })` on the authenticated server client.

## Which addresses receive what

Supabase, with "Secure email change" enabled (the project default), sends a
confirmation to **both** addresses:

| Address       | Email                                                          | Purpose                                    |
| ------------- | -------------------------------------------------------------- | ------------------------------------------ |
| Old (current) | "Confirm change of email" — link to confirm from the old box   | Proves the user still controls the old box |
| New           | "Confirm change of email" — link to confirm from the new box   | Proves the user controls the new box       |

The change only takes effect after **both** links are followed. Until that
point the UI shows a "pending — check both inboxes" banner. The new address
is also recorded by Supabase as `auth.users.email_change_sent_at`.

## Callback handling

Both confirmation links land on `/auth/confirm?token_hash=...&type=email_change`.
The existing handler (`app/auth/confirm/route.ts`) calls
`supabase.auth.verifyOtp({ type, token_hash })`, which Supabase uses to
mark the corresponding side (old/new) as confirmed. On the final hop, the
session cookie is refreshed with the new email.

If the `profiles` table grows an `email` column in the future, mirror the
update there inside the confirm handler — at the moment we only persist the
email in `auth.users`, so there is nothing to write.

## Failure modes

- **Expired link:** redirected to `/auth/error?error=expired` with a
  "Send a new link" button (which routes back to /auth/login).
- **Reused link:** `/auth/error?error=used`.
- **Tampered/unknown link:** `/auth/error?error=invalid`.
- **Email already in use by another account:** Supabase returns an error;
  the form surfaces it inline.

## Rate limiting

`POST /api/account/change-email` is limited to **3 requests/hour per user**
via Upstash (`lib/rate-limit.ts`, key `auth-change-email`). This protects
both Supabase's own send quota and the user's inbox.

## Audit

The change is auditable via Supabase's `auth.users.email_change_*` columns
and the auth log. We do not write our own audit row for this event.

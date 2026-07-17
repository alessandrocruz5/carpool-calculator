# Launch configuration runbook

This runbook covers the go-live configuration needed to open the app to
public self-serve signup. Self-serve group creation and onboarding already
ship in the app — what's left is dashboard-level config (no code diff) plus
the CAPTCHA provider setup that SABAY-43 consumes.

Work through the steps in order and check each one off. **Do not flip the
Supabase CAPTCHA toggle (step 3) until SABAY-43 is deployed** — see the
sequencing warning in that section.

## 1. Production SMTP (Resend)

Supabase's built-in email sender is rate-limited and unsuitable for public
signup — every magic-link and invite email must go through a real SMTP
provider with a verified sending domain.

- [ ] Sign up at [resend.com](https://resend.com) (free tier: 3,000
      emails/month, 100/day — re-evaluate before launch if volume is
      expected to exceed that).
- [ ] **Add and verify your sending domain** in Resend → Domains → Add
      Domain. Resend gives you DNS records to add at your domain registrar:
      - **SPF**: a `TXT` record (usually merged into an existing `v=spf1`
        record, or added as `v=spf1 include:amazonses.com ~all`).
      - **DKIM**: one or more `CNAME` records Resend provides.
      - Wait for Resend to show the domain as **Verified** (DNS propagation
        can take up to 24–48h, usually much faster).
- [ ] Create an API key in Resend → API Keys (sending-only scope is
      sufficient).
- [ ] In the Supabase dashboard → **Authentication → Emails → SMTP
      Settings**, enable "Custom SMTP" and fill in:
      | Field | Value |
      | --- | --- |
      | Sender email | e.g. `noreply@yourdomain.com` (must be on the verified domain) |
      | Sender name | e.g. `Sabay` |
      | Host | `smtp.resend.com` |
      | Port | `465` |
      | Username | `resend` |
      | Password | the Resend API key |
- [ ] Save, then **verify**: trigger a test signup (magic-link sign-in with
      a fresh email) and a test group invite (`/admin/members` → invite an
      email). Confirm both arrive from the custom sender address, and check
      the message headers show `spf=pass` and `dkim=pass` (Gmail: "Show
      original" on the received email).

## 2. Leaked-password protection

Supabase can reject passwords that appear in known breach databases
(HaveIBeenPwned k-anonymity check). This app uses magic-link auth only
(no password sign-in), but the toggle is a cheap, no-downside hardening
step in case password auth is ever enabled later.

- [ ] Supabase dashboard → **Authentication → Policies** (or **Auth →
      Settings** depending on dashboard version) → enable **"Leaked
      password protection"**.
- [ ] **Verify**: Supabase dashboard shows the toggle as enabled. No
      user-facing check needed since this app has no password sign-up flow.

## 3. Cloudflare Turnstile (CAPTCHA on sign-in)

SABAY-43 adds Turnstile to the sign-in form to stop bot signups. This step
sets up the Turnstile *provider* side (site key, secret key) — the app
code that sends and verifies the token ships in SABAY-43.

- [ ] Sign in to the [Cloudflare dashboard](https://dash.cloudflare.com) →
      **Turnstile** → **Add a site**.
- [ ] Domain: your production domain (add `localhost` too if you want
      Turnstile to render in local dev — use a test/dev widget mode key,
      not the production one).
- [ ] Widget mode: **Managed** (recommended default — Cloudflare decides
      when to show an interactive challenge vs. running invisibly).
- [ ] Copy the **Site Key** (public) and **Secret Key** (server-only).
- [ ] Add to `.env.local` / Vercel env vars:
      - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — the site key
      - `TURNSTILE_SECRET_KEY` — the secret key
      (see `.env.example` for the documented shape).

> **Sequencing warning — read before enabling anything in Supabase:**
> Supabase Auth has its own "Enable CAPTCHA protection" toggle under
> **Authentication → Attack Protection**, which — once turned on — requires
> every auth request (magic-link sign-in) to include a valid Turnstile
> token or Supabase rejects it with an error.
>
> **Deploy SABAY-43 to production *before* flipping that toggle.** If the
> toggle is enabled first, the client isn't sending tokens yet and **every
> sign-in breaks** (existing users included) until SABAY-43 ships.
>
> Correct order:
> 1. Set up the Turnstile site above and add the keys to Vercel env vars.
> 2. Deploy SABAY-43 (adds `components/Turnstile.tsx` to the login form and
>    verifies the token server-side in `/api/auth/magic-link`).
> 3. **Then** go to Supabase dashboard → **Authentication → Attack
>    Protection** → enable **"Enable CAPTCHA protection"**, provider
>    **Turnstile**, paste the secret key.
> 4. **Verify**: sign out, attempt sign-in on production. Confirm the
>    Turnstile widget renders on the login form and sign-in still succeeds.
>    Then confirm an automated/no-token request to
>    `/api/auth/magic-link` is rejected (e.g. `curl` the endpoint directly
>    without a token — expect a 4xx).

## 4. Uptime monitoring

Already documented in [`docs/ops/uptime.md`](./uptime.md) — the API health
check and homepage monitors described there should be live before opening
signup publicly. This step is just a pointer; no new config here.

- [ ] Confirm both monitors in `docs/ops/uptime.md` are set up and the test
      alert email was received (see that doc's own checklist).

## Rollback

If anything in this runbook causes an incident (e.g. the CAPTCHA toggle
was flipped too early per the warning above):

1. Supabase dashboard → **Authentication → Attack Protection** → disable
   "Enable CAPTCHA protection" immediately restores sign-in.
2. Custom SMTP can be disabled the same way (toggle "Custom SMTP" off) to
   fall back to Supabase's built-in sender if the Resend domain has an
   issue.

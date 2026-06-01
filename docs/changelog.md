# Changelog

## 1.3.0 — 2026-06-01

Member visibility & group switching

- Members now show up reliably in the Trip dashboard and in the driver and passenger pickers.
- Fixed members not appearing after switching groups.
- Resolved a redirect loop that could occur when switching groups.
- Database fixes for member visibility across group-scoped data.

## 1.2.0 — 2026-05-30

Onboarding & release polish

- New first-run onboarding flow that creates your first group, with a redirect straight back into the app after you confirm your email.
- Faster pages: server session and role lookups are now cached and run in parallel.
- Live-product features and audit remediation rolled out together with database performance and security hardening.
- Added a pre-merge audit trail for develop to main integrations.

## 1.1.0 — 2026-05-29

Security & performance hardening

- Locked down SECURITY DEFINER database functions so they can no longer be called anonymously.
- Completed a full row-level-security (RLS) policy audit and tightened policies.
- Added a missing foreign-key index on trip disputes and dropped two redundant composite indexes for faster writes.
- Added CRUD performance baseline probes and audit snapshots to catch regressions.

## 1.0.0 — 2026-05-27

Public launch — the first release of Sabay.

- Trip splitting: per-leg cost splitting for morning and evening runs, with per-leg route toggles and a live day total per rider.
- Groups and roles: multi-tenant groups with profiles, members, and cars. Driver and passenger roles backed by Supabase auth and role-based access, with a read-only view for passengers.
- Cars and mileage: per-car fill-up tracking and rolling km/L, so estimates use your real fuel efficiency.
- Gas prices: gas price tracking with stale-price reminders delivered via web push notifications.
- Payments: payment tracking with bulk updates, plus a dispute reporting flow with admin resolution.
- Offline-first PWA: installable app with offline request queuing and toast notifications, plus loading skeletons across major routes.
- Accounts: email change, full data export, and account deletion.
- Operations: Sentry error monitoring with PII scrubbing and release tracking, Vercel Analytics and Speed Insights, audit logging, trip archival, rate limiting, security headers, and server-side authorization for admin routes.
- Quality: end-to-end tests with Playwright in CI and a comprehensive API and store test suite.

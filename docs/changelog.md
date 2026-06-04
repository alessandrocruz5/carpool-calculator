# Changelog

## 1.5.0 — 2026-06-04

Mileage override system overhaul

- Added an explicit toggle to control whether the manual mileage override takes priority over the measured rolling average — the rolling average is preferred by default once fill-up data is available.
- Introduced `resolveEffectiveMileage()` as the single source of truth for mileage resolution across the UI and trip-creation API, so payment splits always match what the settings screen displays.
- Rolling average is now written back to the car record on every fill-up, so cost estimates stay current without requiring a page refresh.
- The override is automatically disabled the first time a rolling average becomes computable, so users see real measured data by default.
- Database migration adds `mileage_override_enabled` to the settings table.

## 1.4.1 — 2026-06-03

Constraint & migration fixes

- Fixed trips and gas prices unique constraints to be scoped per group, preventing false conflicts when multiple groups share the same date.
- Fixed gas price upsert to use the new group-scoped constraint.
- Fixed three CRUD constraint bugs introduced by the per-leg distance migrations.
- Reconciled migration filenames to match the live Supabase ledger timestamps (internal, no schema change).

## 1.4.0 — 2026-06-02

Per-leg distance tracking & navigation redesign

- Each trip leg now carries its own distance, enabling accurate cost splits for asymmetric morning and evening routes. Existing trips are backfilled from the round-trip setting.
- Distance input added to the trip UI for morning and evening legs independently.
- Full navigation IA redesign: account, groups, members, and sign-out collapsed into a single account menu; bottom tabs now driven by a centralised `navConfig` with role-based filtering and Lucide icons.
- Toast notifications upgraded with success, error, and info variants, improved animations, dismiss button, and proper ARIA attributes.
- App rebranded from "Carpool Calculator" to "Sabay" across all page titles, metadata, and the PWA manifest.
- "Manage cars" shortcut added to the settings page.

## 1.3.1 — 2026-06-01

Member management fixes

- Linked passenger is now deactivated automatically when a member is removed from the group.
- Passenger is deactivated when a member's role changes from passenger to driver.
- Fixed field-reference errors in the audit log triggers for trips and trip legs.
- Members list now shows the member's email address instead of a raw UUID.

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

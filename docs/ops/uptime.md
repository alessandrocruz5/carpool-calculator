# Uptime Monitor Setup

This document describes the uptime monitoring configuration for the Carpool Calculator production deployment.

## Service

**Recommended: [BetterStack](https://betterstack.com/uptime)** (alternative: [Cronitor](https://cronitor.io/))

BetterStack is recommended because it offers:
- Generous free tier (10 monitors at 3-minute intervals; paid plans for 1-minute checks)
- Built-in status pages
- Multi-region checks to reduce false positives
- Native incident management and on-call escalation

## Monitors

Replace `<prod-url>` with the production domain (e.g. `carpool-calculator.example.com`).

### Monitor 1 — API Health Check

| Field | Value |
| --- | --- |
| Name | `carpool-calculator — API health` |
| Type | HTTP(S) |
| Method | `GET` |
| URL | `https://<prod-url>/api/health` |
| Check interval | **1 minute** |
| Expected status | `200` |
| Alert condition | **2 consecutive failures** |
| Request timeout | 30 seconds |
| Follow redirects | Yes |

### Monitor 2 — Homepage

| Field | Value |
| --- | --- |
| Name | `carpool-calculator — Homepage` |
| Type | HTTP(S) |
| Method | `GET` |
| URL | `https://<prod-url>/` |
| Check interval | **5 minutes** |
| Expected status | `200` |
| Expected body | Response is HTML (e.g. contains `<html`) |
| Alert condition | 2 consecutive failures |
| Request timeout | 30 seconds |
| Follow redirects | Yes |

## Alert Channels

| Channel | Destination |
| --- | --- |
| Email | `alessandrorafaelcruz@gmail.com` |

Both monitors should be wired to the email channel above. Additional channels (SMS, Slack, PagerDuty) can be added later if needed.

## Setup Steps

1. Sign in to BetterStack and create a new project for `carpool-calculator`.
2. Under **Monitors → Create monitor**, configure Monitor 1 with the values above.
3. Repeat for Monitor 2.
4. Under **Integrations → Email**, confirm `alessandrorafaelcruz@gmail.com` and attach it to both monitors as an "on-call" or default alert target.
5. Trigger a test incident (pause the monitor or temporarily point to a 500-returning URL) to confirm the email alert is received.
6. Capture screenshots and store them under `docs/ops/screenshots/` (see placeholders below).

## Screenshots

> Replace the placeholders below with actual screenshots once the monitors are live.

- ![Monitor 1 — API health configuration](./screenshots/uptime-monitor-1-api-health.png)
- ![Monitor 2 — Homepage configuration](./screenshots/uptime-monitor-2-homepage.png)
- ![Alert channels — email](./screenshots/uptime-alert-channels.png)
- ![Test alert email received](./screenshots/uptime-test-alert-email.png)

## Runbook

When an alert fires:

1. Open the BetterStack incident page linked in the alert email.
2. Check the latest deploy in the hosting provider dashboard — recent deploy = likely cause.
3. Hit `https://<prod-url>/api/health` manually to confirm.
4. Check application logs and the upstream database/provider status pages.
5. If unable to recover within 15 minutes, roll back to the previous deploy.
6. After resolution, file a brief postmortem note in `docs/ops/incidents/`.

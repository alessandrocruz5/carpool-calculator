import * as Sentry from "@sentry/nextjs";
import { scrubPII } from "./lib/sentry-scrub";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
  beforeSend(event) {
    return scrubPII(event);
  },
  beforeBreadcrumb(breadcrumb) {
    return scrubPII(breadcrumb);
  },
});

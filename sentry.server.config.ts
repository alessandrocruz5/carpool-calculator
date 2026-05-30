import * as Sentry from "@sentry/nextjs";
import { scrubPII } from "./lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.1,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  beforeSend(event) {
    return scrubPII(event);
  },
  beforeBreadcrumb(breadcrumb) {
    return scrubPII(breadcrumb);
  },
});

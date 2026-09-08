/**
 * Auth email (SMTP) diagnostic.
 *
 * No SMTP credentials live in this repo — every email the app sends is handed
 * to Supabase Auth, which relays it over the SMTP configured in the Supabase
 * dashboard (Authentication -> Emails -> SMTP Settings). When mail stops
 * arriving, the decisive question is whether Supabase *rejected* the send or
 * *accepted* it and the message died downstream. The app can't tell you: the
 * login form shows one red line, and a rejection and a silent non-delivery
 * look identical from a browser.
 *
 * This script asks Supabase directly and prints the raw upstream error, then
 * maps it to the dashboard setting that causes it.
 *
 * Usage:
 *   npx tsx scripts/diagnose-email.ts you@example.com
 *
 * Required env (loaded from .env.local then .env automatically):
 *   NEXT_PUBLIC_SUPABASE_URL              - Supabase project URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  - anon/publishable key
 *
 * This sends a REAL magic-link email and counts against the project's auth
 * rate limit. Use an address you can read.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path: string): boolean {
  try {
    const content = readFileSync(path, "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env) || process.env[key] === "") {
        process.env[key] = value;
      }
    }
    return true;
  } catch {
    return false;
  }
}

const repoRoot = resolve(__dirname, "..");
loadEnvFile(resolve(repoRoot, ".env.local"));
loadEnvFile(resolve(repoRoot, ".env"));

/** Upstream error text -> the dashboard setting that actually causes it. */
const CAUSES: { match: RegExp; cause: string }[] = [
  {
    match: /captcha/i,
    cause:
      "Authentication -> Attack Protection has CAPTCHA protection ENABLED, but this\n" +
      "  request sent no Turnstile token. If NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset in\n" +
      "  the deployment, the widget renders nothing and EVERY real sign-in fails the same\n" +
      "  way. Fix: set the Turnstile env vars, or turn the toggle off until they are set.\n" +
      "  (docs/ops/launch-config.md section 3 covers the required ordering.)",
  },
  {
    match: /rate limit|too many/i,
    cause:
      "Supabase's own auth email cap, which applies even with custom SMTP.\n" +
      "  Fix: Authentication -> Rate Limits -> raise 'Emails sent per hour'.",
  },
  {
    match: /error sending|smtp|relay|connection|timeout|dial/i,
    cause:
      "Supabase could not hand the message to your SMTP provider. Check\n" +
      "  Authentication -> Emails -> SMTP Settings: username must be the literal string\n" +
      "  'resend', password a Resend API key (re_...), host smtp.resend.com, port 465\n" +
      "  (try 587 if 465 is blocked), and the sender address must be on a domain Resend\n" +
      "  shows as Verified.",
  },
  {
    match: /signups not allowed|disabled/i,
    cause:
      "Sign-ups are disabled, so a magic link to an unknown address is refused.\n" +
      "  Fix: Authentication -> Sign In / Providers -> allow new users, or test with an\n" +
      "  address that already has an account.",
  },
  {
    match: /redirect|not allowed/i,
    cause:
      "The redirect target is not allowlisted.\n" +
      "  Fix: Authentication -> URL Configuration -> Redirect URLs -> add <site>/auth/confirm.",
  },
];

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    console.error("usage: npx tsx scripts/diagnose-email.ts you@example.com");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Report configuration without printing secrets — a missing SITE_URL or an
  // unset Turnstile key is itself a common cause below.
  console.log("Config");
  console.log(`  NEXT_PUBLIC_SUPABASE_URL          ${url ?? "(unset)"}`);
  console.log(
    `  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ${key ? "set" : "(unset)"}`
  );
  console.log(
    `  NEXT_PUBLIC_SITE_URL              ${process.env.NEXT_PUBLIC_SITE_URL ?? "(unset)"}`
  );
  console.log(
    `  NEXT_PUBLIC_TURNSTILE_SITE_KEY    ${process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? "set" : "(unset)"}`
  );
  console.log("");

  if (!url || !key) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY not configured."
    );
    process.exit(1);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Sending a magic link to ${email} ...`);
  const startedAt = Date.now();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${siteUrl}/auth/confirm` },
  });
  const elapsed = Date.now() - startedAt;

  if (!error) {
    console.log(`\nSupabase ACCEPTED the send (${elapsed}ms).`);
    console.log(
      "\nSo the rejection paths are ruled out: credentials, CAPTCHA and rate limits\n" +
        "are all fine. If no mail arrives, it died after Supabase handed it off:\n" +
        "  1. Resend -> Emails: if the message is not listed, Supabase is still using\n" +
        "     its built-in sender — 'Custom SMTP' is not actually enabled/saved.\n" +
        "  2. If it IS listed, read its status there (bounced, complained, suppressed).\n" +
        "  3. Check spam, and confirm the sending domain shows Verified in Resend."
    );
    return;
  }

  const status = (error as { status?: number }).status;
  console.log(`\nSupabase REJECTED the send (${elapsed}ms).`);
  console.log(`  status: ${status ?? "(none)"}`);
  console.log(`  message: ${error.message}`);

  const hit = CAUSES.find((c) => c.match.test(error.message));
  console.log(
    hit
      ? `\nLikely cause:\n  ${hit.cause}`
      : "\nNo known mapping for this message. Read it against Supabase dashboard ->\n" +
          "  Logs -> Auth logs, which carries the verbatim upstream SMTP error."
  );
  process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

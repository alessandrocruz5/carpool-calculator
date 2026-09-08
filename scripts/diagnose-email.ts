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
 *   npx tsx scripts/diagnose-email.ts you@example.com --via-app https://your-app.vercel.app
 *
 * Default mode calls Supabase directly with the local env. `--via-app` instead
 * POSTs to that deployment's own /api/auth/magic-link, which is the path real
 * users take. Run both when a direct send works but signing in does not: they
 * differ only in whose environment is used, so a split result means the
 * deployment is pointed at a different Supabase project than your .env.local.
 *
 * Required env (loaded from .env.local then .env automatically):
 *   NEXT_PUBLIC_SUPABASE_URL              - Supabase project URL
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  - anon/publishable key
 *   (not needed for --via-app, which uses the deployment's own env)
 *
 * This sends a REAL magic-link email and counts against the project's auth
 * rate limit — the app endpoint additionally allows only 3 per hour per
 * address. Use an address you can read.
 *
 * Note on which ADDRESS you test with: Supabase's built-in sender delivers
 * only to members of your own Supabase organization. So an org address
 * arriving proves nothing on its own — always confirm with an outside
 * address before concluding that SMTP works.
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

/**
 * Exercise the deployment's own magic-link endpoint — the path real users take,
 * using the deployment's environment rather than this machine's.
 */
async function viaApp(email: string, baseUrl: string): Promise<void> {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/api/auth/magic-link`;
  console.log(`POST ${endpoint}`);
  const startedAt = Date.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const elapsed = Date.now() - startedAt;
  const text = await res.text();
  console.log(`\n  status: ${res.status} (${elapsed}ms)`);
  console.log(`  body:   ${text.slice(0, 500)}`);

  if (res.ok) {
    console.log(
      "\nThe deployed app ACCEPTED the send, so its Supabase call returned no error.\n" +
        "If this mail never arrives while a direct send to the same address does, the two\n" +
        "runs are not talking to the same project: compare the URL printed above against\n" +
        "NEXT_PUBLIC_SUPABASE_URL in the deployment's own environment (Vercel -> Settings\n" +
        "-> Environment Variables), and check that a redeploy has happened since it was\n" +
        "last changed — env changes do not apply to already-built deployments."
    );
    return;
  }
  if (res.status === 429) {
    console.log(
      "\nThe app's own limit: 3 magic links per hour per address. Not an SMTP fault —\n" +
        "wait out the hour or test with a different address."
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    "\nThe deployed app REJECTED the send. The body above carries Supabase's reason;\n" +
      "match it against the causes in docs/ops/launch-config.md."
  );
  process.exitCode = 1;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flagIdx = args.indexOf("--via-app");
  const appBaseUrl = flagIdx === -1 ? null : args[flagIdx + 1];
  const email = args.find((a) => !a.startsWith("--") && a !== appBaseUrl);
  if (!email || (flagIdx !== -1 && !appBaseUrl)) {
    console.error(
      "usage: npx tsx scripts/diagnose-email.ts you@example.com [--via-app https://your-app.vercel.app]"
    );
    process.exit(1);
  }

  if (appBaseUrl) {
    console.log(`Testing the deployed app's own endpoint for ${email} ...\n`);
    await viaApp(email, appBaseUrl);
    return;
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
      "\nThat rules out the whole rejection class — credentials, CAPTCHA and rate limits\n" +
        "would all have returned an error here, because GoTrue sends synchronously. The\n" +
        "message died AFTER Supabase handed it off. Two causes, and one test separates them:\n" +
        "\n" +
        "  Re-run this against an address that is a MEMBER of your Supabase organization,\n" +
        "  and compare:\n" +
        "\n" +
        "    member address arrives, others don't\n" +
        "      -> 'Custom SMTP' is not actually enabled/saved, so Supabase is still on its\n" +
        "         built-in sender, which only delivers to your own org's members and\n" +
        "         silently drops everything else. Fix: Authentication -> Emails -> SMTP\n" +
        "         Settings, enable Custom SMTP and save (section 1 of the runbook).\n" +
        "\n" +
        "    nothing arrives for either\n" +
        "      -> Custom SMTP is live but Resend is dropping it. Open Resend -> Emails:\n" +
        "         if the message is not listed, the credentials point at a different\n" +
        "         project; if it is, read its status (bounced, suppressed, spam) and\n" +
        "         confirm the sending domain shows Verified.\n" +
        "\n" +
        "  A checked 'Enable Custom SMTP' box is not proof it is in effect — an unsaved\n" +
        "  form, or the setting living on a different project than the one this script\n" +
        "  just used, both present exactly as the built-in sender. Resend -> Emails is\n" +
        "  the authority: if this send is not listed there, Resend was not in the path.\n" +
        "\n" +
        "  If mail arrives from here but not from the app, re-run with --via-app against\n" +
        "  the deployment to test that path with ITS environment."
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

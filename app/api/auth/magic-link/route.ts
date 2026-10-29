import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/log";
import { resolveSiteUrl } from "@/lib/auth/siteUrl";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    captchaToken?: string;
  };
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }

  const limited = await enforceRateLimit("auth-magic-link", `email:${email}`, {
    requests: 3,
    window: "1 h",
  });
  if (limited) return limited;

  const supabase = await createClient();
  const siteUrl = resolveSiteUrl(req);
  const emailRedirectTo = `${siteUrl}/auth/confirm`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      captchaToken: body.captchaToken,
    },
  });
  if (error) {
    // Forward Supabase's own 4xx (e.g. a rejected/missing CAPTCHA token once the
    // dashboard toggle is on) instead of masking it as a 500 — a bot without a
    // token is a client error, not a server fault, and shouldn't spam Sentry.
    const upstream = (error as { status?: number }).status;
    const status = upstream && upstream >= 400 && upstream < 500 ? upstream : 500;
    // Either way, record the upstream reason server-side: a misconfigured
    // dashboard (CAPTCHA protection enabled while the client sends no token,
    // custom SMTP rejecting the handoff) rejects every real sign-in too, and
    // without this line that failure leaves no trace anywhere. 5xx is a genuine
    // send failure and pages via Sentry; 4xx stays a log-only warn so bot
    // traffic can't spam it. The address is deliberately not logged.
    const meta = { reason: error.message, status: upstream };
    if (status >= 500) log.error("magic link send failed", meta);
    else log.warn("magic link rejected upstream", meta);
    return NextResponse.json({ error: error.message }, { status });
  }
  // Record where the link will send the user back to. Supabase silently
  // substitutes its own Site URL when `redirect_to` is not in the dashboard's
  // Redirect URL allowlist, so this line is what tells apart "the app asked
  // for the wrong host" from "the app asked correctly and Supabase overrode
  // it" — a distinction that is invisible in the delivered email and cost a
  // full debugging cycle to establish by hand. Not sensitive; no address.
  log.info("magic link sent", { emailRedirectTo });
  return NextResponse.json({ ok: true });
}

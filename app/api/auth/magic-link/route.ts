import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

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
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm`,
      captchaToken: body.captchaToken,
    },
  });
  if (error) {
    // Forward Supabase's own 4xx (e.g. a rejected/missing CAPTCHA token once the
    // dashboard toggle is on) instead of masking it as a 500 — a bot without a
    // token is a client error, not a server fault, and shouldn't spam Sentry.
    const upstream = (error as { status?: number }).status;
    const status = upstream && upstream >= 400 && upstream < 500 ? upstream : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ ok: true });
}

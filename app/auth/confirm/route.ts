import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePostConfirmRedirect } from "@/lib/auth/resolvePostConfirmRedirect";
import { log } from "@/lib/log";

type ErrorCode = "expired" | "invalid" | "used" | "wrong_browser" | "incomplete";

type UpstreamError = { name?: string; code?: string; message?: string };

/**
 * A missing PKCE verifier is the most common cause of "that link isn't valid",
 * and the link is in fact fine. `signInWithOtp` stores a code verifier in a
 * cookie belonging to the browser that asked for the link; only that browser
 * can complete the exchange. Open the mail in an email client's in-app
 * webview, or on a phone when the link was requested on a laptop, and the
 * cookie simply isn't there.
 *
 * auth-js surfaces this as an ordinary 400, so without matching on it here it
 * lands in the `invalid` bucket and the user is told the link was mistyped or
 * issued for another account — both wrong, and neither hints at the one thing
 * that would actually work.
 */
function isMissingVerifier(error: UpstreamError): boolean {
  return (
    error.name === "AuthPKCECodeVerifierMissingError" ||
    error.code === "pkce_code_verifier_not_found" ||
    /code verifier/i.test(error.message ?? "")
  );
}

function classifyError(message: string | undefined): ErrorCode {
  const m = (message ?? "").toLowerCase();
  if (m.includes("expired")) return "expired";
  if (m.includes("already") || m.includes("used")) return "used";
  return "invalid";
}

function classifyUpstream(error: UpstreamError): ErrorCode {
  if (isMissingVerifier(error)) return "wrong_browser";
  return classifyError(error.message);
}

function errorRedirect(request: NextRequest, code: ErrorCode) {
  const url = new URL("/auth/error", request.url);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

/**
 * Record why a confirmation failed. Until this existed a failed sign-in left
 * no trace anywhere — the reason was collapsed into a three-value enum and
 * thrown away, so "the link is invalid" could not be told apart from a
 * misconfigured dashboard without guessing.
 *
 * `invalid` is the only bucket that escalates: it means we could not explain
 * the failure at all. The rest are expected in normal use (links do expire,
 * mail scanners do burn one-time tokens, people do open mail in a different
 * browser) and would only drown Sentry, so they stay warn-level — still
 * visible in the platform logs, where a sudden flood of one code is the
 * signal worth reading.
 */
function logFailure(code: ErrorCode, meta: Record<string, unknown>) {
  const msg = `auth confirm failed: ${code}`;
  if (code === "invalid") log.error(msg, meta);
  else log.warn(msg, meta);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";
  const errorParam =
    searchParams.get("error") ?? searchParams.get("error_code");
  const errorDescription = searchParams.get("error_description");

  // Which grant the link carried, for the logs. Never log the values —
  // `code` and `token_hash` are live single-use credentials.
  const grant = code ? "code" : token_hash ? "token_hash" : "none";

  if (errorParam) {
    const classified = classifyError(errorDescription ?? errorParam);
    logFailure(classified, {
      stage: "upstream_redirect",
      grant,
      reason: errorDescription ?? errorParam,
    });
    return errorRedirect(request, classified);
  }

  const supabase = await createClient();

  let confirmed = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const classified = classifyUpstream(error as UpstreamError);
      logFailure(classified, {
        stage: "exchange_code",
        grant,
        reason: error.message,
        upstreamCode: (error as UpstreamError).code,
      });
      return errorRedirect(request, classified);
    }
    confirmed = true;
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (error) {
      const classified = classifyUpstream(error as UpstreamError);
      logFailure(classified, {
        stage: "verify_otp",
        grant,
        type,
        reason: error.message,
        upstreamCode: (error as UpstreamError).code,
      });
      return errorRedirect(request, classified);
    }
    confirmed = true;
  }

  if (confirmed) {
    // Claim any pending invites before we decide where to send the user.
    await supabase.rpc("claim_member_invite");

    // Route based on group membership:
    //   0 groups  → /onboarding (new user, needs to create or join a group)
    //   ≥1 groups → ?next= param (if safe) or /
    const { data: { user } } = await supabase.auth.getUser();
    const destination = user
      ? await resolvePostConfirmRedirect({ supabase, userId: user.id, next })
      : next;

    return NextResponse.redirect(new URL(destination, request.url));
  }

  // Neither grant reached us. The link carried no `code` and no usable
  // `token_hash`+`type` pair — a truncated URL, a bare visit to this route,
  // or an implicit-flow link whose tokens sit in the URL fragment, which the
  // browser never sends to a server. Distinct from a rejected credential, and
  // worth telling apart in the logs: a run of these points at the Supabase
  // email template rather than at anything in this app.
  logFailure("incomplete", {
    stage: "no_grant",
    grant,
    hasType: type !== null,
  });
  return errorRedirect(request, "incomplete");
}

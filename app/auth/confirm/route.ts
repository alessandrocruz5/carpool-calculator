import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ErrorCode = "expired" | "invalid" | "used";

function classifyError(message: string | undefined): ErrorCode {
  const m = (message ?? "").toLowerCase();
  if (m.includes("expired")) return "expired";
  if (m.includes("already") || m.includes("used")) return "used";
  return "invalid";
}

function errorRedirect(request: NextRequest, code: ErrorCode) {
  const url = new URL("/auth/error", request.url);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
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

  if (errorParam) {
    return errorRedirect(request, classifyError(errorDescription ?? errorParam));
  }

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await supabase.rpc("claim_member_invite");
      return NextResponse.redirect(new URL(next, request.url));
    }
    return errorRedirect(request, classifyError(error.message));
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      await supabase.rpc("claim_member_invite");
      return NextResponse.redirect(new URL(next, request.url));
    }
    return errorRedirect(request, classifyError(error.message));
  }

  return errorRedirect(request, "invalid");
}

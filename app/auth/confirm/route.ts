import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolvePostConfirmRedirect } from "@/lib/auth/resolvePostConfirmRedirect";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  const supabase = await createClient();

  let confirmed = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    confirmed = !error;
  } else if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    confirmed = !error;
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

  return NextResponse.redirect(new URL("/auth/login?error=invalid_link", request.url));
}

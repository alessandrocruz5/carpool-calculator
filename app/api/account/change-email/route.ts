import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/requireDriver";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const auth = await requireAuth(supabase);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const newEmail = (body.email ?? "").trim().toLowerCase();
  if (!newEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
    return NextResponse.json({ error: "invalid email" }, { status: 400 });
  }

  const limited = await enforceRateLimit(
    "auth-change-email",
    `user:${auth.userId}`,
    { requests: 3, window: "1 h" }
  );
  if (limited) return limited;

  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, pending_email: newEmail });
}

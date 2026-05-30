import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = createAdminClient();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const { error } = await supabase
      .from("settings")
      .select("group_id")
      .limit(1)
      .abortSignal(controller.signal);
    clearTimeout(timeout);
    if (error) {
      return NextResponse.json({ status: "degraded", db: "error" }, { status: 503 });
    }
    return NextResponse.json({
      status: "ok",
      db: "ok",
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ status: "degraded", db: "error" }, { status: 503 });
  }
}

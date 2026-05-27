import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireGroupDriver } from "@/lib/auth/requireDriver";
import { requireActiveGroupId } from "@/lib/group";
import type { DbTripDispute, TripDisputeStatus } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const driver = await requireGroupDriver(supabase, group.groupId);
  if (!driver.ok) return driver.response;

  const body = (await req.json().catch(() => ({}))) as {
    status?: TripDisputeStatus;
    resolutionNote?: string;
  };
  if (body.status !== "resolved" && body.status !== "dismissed") {
    return NextResponse.json(
      { error: "status must be 'resolved' or 'dismissed'" },
      { status: 400 }
    );
  }
  const note = (body.resolutionNote ?? "").trim();
  if (body.status === "dismissed" && note.length === 0) {
    return NextResponse.json(
      { error: "resolutionNote is required when dismissing" },
      { status: 400 }
    );
  }
  if (note.length > 1000) {
    return NextResponse.json({ error: "resolutionNote too long" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("trip_disputes")
    .update({
      status: body.status,
      resolution_note: note || null,
      resolved_at: new Date().toISOString(),
      resolved_by: driver.userId,
    })
    .eq("id", id)
    .eq("group_id", group.groupId)
    .eq("status", "open")
    .select(
      "id, group_id, trip_id, reporter_user_id, reason, status, resolution_note, created_at, resolved_at, resolved_by"
    )
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: "dispute not found or already resolved" },
      { status: 404 }
    );
  }
  return NextResponse.json(data as DbTripDispute);
}

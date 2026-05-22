import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { fromDbFillup, toDbFillupInsert } from "@/lib/supabase/mappers";
import type { DbFillup } from "@/lib/supabase/types";
import type { Fillup } from "@/lib/mileage";
import { requireGroupDriver } from "@/lib/auth/requireDriver";
import { requireActiveGroupId } from "@/lib/group";

export const dynamic = "force-dynamic";

/** Verify `carId` exists and is owned by `userId`. */
async function ownsCar(
  supabase: SupabaseClient,
  carId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("cars")
    .select("owner_user_id")
    .eq("id", carId)
    .maybeSingle();
  return (data as { owner_user_id: string } | null)?.owner_user_id === userId;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const carId = new URL(req.url).searchParams.get("car_id");
  let query = supabase
    .from("fillups")
    .select("*")
    .eq("group_id", group.groupId);
  if (carId) query = query.eq("car_id", carId);
  const { data, error } = await query.order("date", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(((data ?? []) as DbFillup[]).map(fromDbFillup));
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const denied = await requireGroupDriver(supabase, group.groupId);
  if (!denied.ok) return denied.response;
  const body = (await req.json()) as Omit<Fillup, "id"> & {
    id?: string;
    carId?: string | null;
  };
  if (!body.carId)
    return NextResponse.json({ error: "car_id required" }, { status: 400 });
  if (!(await ownsCar(supabase, body.carId, denied.userId)))
    return NextResponse.json(
      { error: "car not found or not owned by you" },
      { status: 403 }
    );
  const insert: Partial<DbFillup> = toDbFillupInsert(body, {
    groupId: group.groupId,
    ownerUserId: denied.userId,
  });
  if (body.id) insert.id = body.id;
  const { data, error } = await supabase
    .from("fillups")
    .insert(insert)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(fromDbFillup(data as DbFillup));
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const denied = await requireGroupDriver(supabase, group.groupId);
  if (!denied.ok) return denied.response;
  const body = (await req.json()) as Partial<Omit<Fillup, "id">> & {
    id?: string;
    carId?: string | null;
  };
  if (!body.id)
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  if (!body.carId)
    return NextResponse.json({ error: "car_id required" }, { status: 400 });
  if (!(await ownsCar(supabase, body.carId, denied.userId)))
    return NextResponse.json(
      { error: "car not found or not owned by you" },
      { status: 403 }
    );
  const patch: Partial<DbFillup> = {
    car_id: body.carId,
    owner_user_id: denied.userId,
  };
  if (body.date !== undefined) patch.date = body.date;
  if (body.liters !== undefined) patch.liters = body.liters;
  if (body.totalPhp !== undefined) patch.total_php = body.totalPhp;
  if (body.odometerKm !== undefined) patch.odometer_km = body.odometerKm;
  const { data, error } = await supabase
    .from("fillups")
    .update(patch)
    .eq("id", body.id)
    .eq("group_id", group.groupId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(fromDbFillup(data as DbFillup));
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const group = await requireActiveGroupId(supabase);
  if (!group.ok) return group.response;
  const denied = await requireGroupDriver(supabase, group.groupId);
  if (!denied.ok) return denied.response;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { error } = await supabase
    .from("fillups")
    .delete()
    .eq("id", id)
    .eq("group_id", group.groupId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fromDbCar, toDbCarInsert } from "@/lib/supabase/mappers";
import type { DbCar } from "@/lib/supabase/types";
import { requireUser } from "@/lib/auth/requireDriver";

export const dynamic = "force-dynamic";

interface CarBody {
  id?: string;
  name?: string;
  fuelEfficiencyKml?: number | null;
  tankSizeLiters?: number | null;
  maxPassengers?: number | null;
}

export async function GET() {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user.ok) return user.response;
  const { data, error } = await supabase
    .from("cars")
    .select("*")
    .eq("owner_user_id", user.userId)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(((data ?? []) as DbCar[]).map(fromDbCar));
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user.ok) return user.response;
  const body = (await req.json()) as CarBody;
  if (!body.name?.trim())
    return NextResponse.json({ error: "name required" }, { status: 400 });
  const insert: Partial<DbCar> = toDbCarInsert({
    ownerUserId: user.userId,
    name: body.name.trim(),
    fuelEfficiencyKml: body.fuelEfficiencyKml ?? null,
    tankSizeLiters: body.tankSizeLiters ?? null,
    maxPassengers: body.maxPassengers ?? null,
  });
  if (body.id) insert.id = body.id;
  const { data, error } = await supabase
    .from("cars")
    .insert(insert)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(fromDbCar(data as DbCar));
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user.ok) return user.response;
  const body = (await req.json()) as CarBody;
  if (!body.id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const patch: Partial<DbCar> = {};
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.fuelEfficiencyKml !== undefined)
    patch.fuel_efficiency_kml = body.fuelEfficiencyKml;
  if (body.tankSizeLiters !== undefined)
    patch.tank_size_liters = body.tankSizeLiters;
  if (body.maxPassengers !== undefined)
    patch.max_passengers = body.maxPassengers;
  const { data, error } = await supabase
    .from("cars")
    .update(patch)
    .eq("id", body.id)
    .eq("owner_user_id", user.userId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(fromDbCar(data as DbCar));
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const user = await requireUser(supabase);
  if (!user.ok) return user.response;
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });
  const { data: tripRows, error: tripErr } = await supabase
    .from("trips")
    .select("id")
    .eq("car_id", id);
  if (tripErr)
    return NextResponse.json({ error: tripErr.message }, { status: 500 });
  const tripCount = (tripRows ?? []).length;
  if (tripCount > 0)
    return NextResponse.json(
      { error: "in_use", tripCount },
      { status: 409 }
    );
  const { error } = await supabase
    .from("cars")
    .delete()
    .eq("id", id)
    .eq("owner_user_id", user.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

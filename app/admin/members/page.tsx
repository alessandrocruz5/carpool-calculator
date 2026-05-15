import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MembersAdmin } from "./MembersAdmin";

export const dynamic = "force-dynamic";

interface MemberRow {
  user_id: string;
  role: "driver" | "passenger";
  passenger_id: string | null;
  created_at: string;
}

interface PassengerRow {
  id: string;
  name: string;
}

export default async function MembersAdminPage() {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = (claims?.claims as { sub?: string } | undefined)?.sub;
  if (!userId) redirect("/auth/login");

  const { data: me } = await supabase
    .from("members")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (me?.role !== "driver") {
    return (
      <div className="max-w-md mx-auto mt-16 text-center text-sm text-slate-600">
        This page is only available to drivers.
      </div>
    );
  }

  const [{ data: members }, { data: passengers }] = await Promise.all([
    supabase
      .from("members")
      .select("user_id, role, passenger_id, created_at")
      .order("created_at", { ascending: true }),
    supabase.from("passengers").select("id, name").order("name"),
  ]);

  return (
    <MembersAdmin
      initialMembers={(members ?? []) as MemberRow[]}
      passengers={(passengers ?? []) as PassengerRow[]}
    />
  );
}

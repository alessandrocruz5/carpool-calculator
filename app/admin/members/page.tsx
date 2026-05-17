import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MembersAdmin } from "./MembersAdmin";

export const dynamic = "force-dynamic";

interface MemberRow {
  user_id: string;
  role: "driver" | "passenger";
  passenger_id: string | null;
  created_at: string;
  email: string | null;
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

  const memberRows = (members ?? []) as Omit<MemberRow, "email">[];

  const emailById = new Map<string, string>();
  try {
    const admin = createAdminClient();
    const { data: usersData } = await admin.auth.admin.listUsers({
      perPage: 1000,
    });
    for (const u of usersData?.users ?? []) {
      if (u.email) emailById.set(u.id, u.email);
    }
  } catch (err) {
    console.error("failed to load member emails", err);
  }

  const initialMembers: MemberRow[] = memberRows.map((m) => ({
    ...m,
    email: emailById.get(m.user_id) ?? null,
  }));

  return (
    <MembersAdmin
      initialMembers={initialMembers}
      passengers={(passengers ?? []) as PassengerRow[]}
    />
  );
}

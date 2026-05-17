import "server-only";
import { createClient } from "@/lib/supabase/server";

export type Membership =
  | { status: "anonymous" }
  | { status: "not-a-member" }
  | { status: "member"; userId: string; role: "driver" | "passenger" };

export async function getMembership(): Promise<Membership> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = (data?.claims as { sub?: string } | undefined)?.sub;
  if (!userId) return { status: "anonymous" };

  const { data: member } = await supabase
    .from("members")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!member) return { status: "not-a-member" };

  return {
    status: "member",
    userId,
    role: member.role === "driver" ? "driver" : "passenger",
  };
}

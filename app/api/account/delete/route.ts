import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuth } from "@/lib/auth/requireDriver";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = await createClient();
  const auth = await requireAuth(supabase);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const admin = createAdminClient();

  // 1. Block deletion if user is sole owner of any group with other members.
  const { data: ownedGroups, error: groupsErr } = await admin
    .from("groups")
    .select("id, name")
    .eq("owner_user_id", userId);
  if (groupsErr) {
    return NextResponse.json({ error: groupsErr.message }, { status: 500 });
  }

  for (const g of ownedGroups ?? []) {
    const { count, error } = await admin
      .from("members")
      .select("user_id", { count: "exact", head: true })
      .eq("group_id", g.id)
      .neq("user_id", userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error: "sole_owner_with_members",
          message: `You're the sole owner of "${g.name}" and other members are still in it. Transfer ownership or remove the members first.`,
          group_id: g.id,
        },
        { status: 409 }
      );
    }
  }

  // 2. Delete user's rows. For groups they solely own with no other members,
  //    we also drop the group + its data via the user-owned rows. We do not
  //    cascade through every linked table here — only what the task lists.
  const errors: string[] = [];

  // fillups owned by the user
  {
    const { error } = await admin
      .from("fillups")
      .delete()
      .eq("owner_user_id", userId);
    if (error) errors.push(`fillups: ${error.message}`);
  }
  // push subscriptions
  {
    const { error } = await admin
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId);
    if (error) errors.push(`push_subscriptions: ${error.message}`);
  }
  // members rows (across all groups)
  {
    const { error } = await admin
      .from("members")
      .delete()
      .eq("user_id", userId);
    if (error) errors.push(`members: ${error.message}`);
  }

  if (errors.length > 0) {
    return NextResponse.json(
      { error: "partial_failure", details: errors },
      { status: 500 }
    );
  }

  // 3. Delete the auth user. profiles cascades via ON DELETE CASCADE.
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // 4. Audit log.
  console.log(
    JSON.stringify({
      event: "account_deleted",
      user_id: userId,
      at: new Date().toISOString(),
    })
  );
  Sentry.addBreadcrumb({
    category: "account",
    message: "account_deleted",
    level: "info",
    data: { user_id: userId },
  });

  // 5. Sign out: clear the session cookie on the user-scoped client.
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}

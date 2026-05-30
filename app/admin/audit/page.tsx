import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireGroupDriver } from "@/lib/auth/requireDriver";
import { requireActiveGroupId } from "@/lib/group";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface AuditRow {
  id: number;
  table_name: string;
  row_pk: string;
  action: "insert" | "update" | "delete";
  actor_user_id: string | null;
  diff: Record<string, [unknown, unknown]>;
  created_at: string;
}

export default async function AuditPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = (claims?.claims as { sub?: string } | undefined)?.sub;
  if (!userId) redirect("/auth/login");

  const group = await requireActiveGroupId(supabase);
  if (!group.ok) redirect("/groups");

  const driver = await requireGroupDriver(supabase, group.groupId);
  if (!driver.ok) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center text-sm text-slate-600">
        This page is only available to drivers.
      </div>
    );
  }

  const { data, error } = await supabase
    .from("audit_log")
    .select("id, table_name, row_pk, action, actor_user_id, diff, created_at")
    .eq("group_id", group.groupId)
    .in("table_name", ["trips", "trip_legs", "trip_leg_riders"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto p-4 text-sm text-red-600">
        Failed to load audit log: {error.message}
      </div>
    );
  }

  const rows = (data ?? []) as AuditRow[];

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <p className="text-xs text-slate-500">
        Last 200 changes to trips, trip legs, and rider assignments.
        Entries older than 90 days are pruned automatically.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No audit entries yet.</p>
      ) : (
        <ul className="divide-y border rounded">
          {rows.map((r) => (
            <li key={r.id} className="p-3 space-y-1 text-sm">
              <div className="flex justify-between font-mono text-xs text-slate-600">
                <span>
                  {r.action.toUpperCase()} {r.table_name} ({r.row_pk.slice(0, 8)}…)
                </span>
                <time>{new Date(r.created_at).toLocaleString()}</time>
              </div>
              <details>
                <summary className="cursor-pointer text-slate-700">
                  {Object.keys(r.diff).length} field(s) changed
                </summary>
                <pre className="text-xs bg-slate-50 p-2 rounded overflow-x-auto mt-1">
{JSON.stringify(r.diff, null, 2)}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

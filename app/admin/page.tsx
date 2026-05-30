import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireGroupDriver } from "@/lib/auth/requireDriver";
import { requireActiveGroupId } from "@/lib/group";
import { ArchiveTripsPanel } from "./ArchiveTripsPanel";
import { DisputesPanel } from "./DisputesPanel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
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

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-8">
      <h1 className="text-2xl font-semibold">Admin</h1>

      <nav className="flex gap-3 text-sm">
        <Link className="underline" href="/admin/members">Members</Link>
        <Link className="underline" href="/admin/audit">Audit log</Link>
      </nav>

      <DisputesPanel />

      <ArchiveTripsPanel />
    </div>
  );
}

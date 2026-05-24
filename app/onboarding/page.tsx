import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OnboardingForm } from "./OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = (claims?.claims as { sub?: string } | undefined)?.sub;
  if (!userId) redirect("/auth/login");

  const { count } = await supabase
    .from("members")
    .select("group_id", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((count ?? 0) > 0) redirect("/");

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Welcome to Carpool</h1>
        <p className="text-sm text-slate-500">
          Create your first group to start tracking trips and splitting costs.
        </p>
      </div>
      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <OnboardingForm />
      </section>
    </div>
  );
}

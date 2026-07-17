import { headers } from "next/headers";
import { LandingPage } from "@/components/landing/LandingPage";
import TodayHome from "./TodayHome";

// `/` is public. Middleware (lib/supabase/middleware.ts) resolves the session
// and forwards `x-user-id` for authenticated requests (and strips any spoofed
// value on `/`), so we can branch on it without a second Supabase round-trip:
//   - signed-out visitor  → public marketing landing (no app shell)
//   - authenticated user  → the existing app home, unchanged
export default async function HomePage() {
  const h = await headers();
  const userId = h.get("x-user-id");

  if (!userId) return <LandingPage />;
  return <TodayHome />;
}

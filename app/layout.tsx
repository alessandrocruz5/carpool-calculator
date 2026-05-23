import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});
import { HydrateStores } from "@/components/HydrateStores";
import { ToastProvider } from "@/components/Toast";
import { PASSENGER_TAB_HREFS } from "@/lib/auth/passengerAccess";

export const metadata: Metadata = {
  title: "Carpool Calculator",
  description: "Per-leg carpool cost split",
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
};

const nav = [
  { href: "/", label: "Today" },
  { href: "/log", label: "Log" },
  { href: "/payments", label: "Payments" },
  { href: "/gas", label: "Gas" },
  { href: "/settings", label: "Settings" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Middleware (lib/supabase/middleware.ts) already resolved the session and
  // looked up the caller's member row; it forwarded both via request headers
  // so we don't have to make the same two Supabase round-trips here.
  const h = await headers();
  const userId = h.get("x-user-id");
  const role = h.get("x-user-role");
  const needsAccountLink =
    userId != null && h.get("x-member-exists") === "0";

  if (needsAccountLink) {
    return (
      <html lang="en" className={cn("font-sans", inter.variable)}>
        <body>
          <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
            <div className="max-w-sm space-y-4">
              <h1 className="text-xl font-semibold">Account not linked</h1>
              <p className="text-sm text-slate-600">
                You&apos;re signed in, but your account isn&apos;t part of this
                carpool yet. Ask the driver to link your account from the
                Members page, then refresh.
              </p>
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  className="text-sm text-brand-600 underline"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </body>
      </html>
    );
  }

  const visibleNav =
    role === "passenger"
      ? nav.filter((n) => (PASSENGER_TAB_HREFS as readonly string[]).includes(n.href))
      : nav;

  return (
    <html lang="en" className={cn("font-sans", inter.variable)}>
      <body>
        <ToastProvider>
        <HydrateStores />
        <div className="min-h-screen flex flex-col">
          <header className="bg-brand-600 text-white px-4 py-3 shadow">
            <div className="max-w-3xl mx-auto flex items-center justify-between">
              <Link href="/" className="font-semibold">Carpool</Link>
              <div className="flex items-center gap-3 text-xs opacity-90">
                <Link href="/account" className="hover:underline">Account</Link>
                <Link href="/admin/members" className="hover:underline">Members</Link>
                <form action="/auth/signout" method="post">
                  <button type="submit" className="hover:underline">Sign out</button>
                </form>
              </div>
            </div>
          </header>
          <main className="flex-1 max-w-3xl w-full mx-auto p-4 pb-24">{children}</main>
          <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200">
            <div
              className="max-w-3xl mx-auto grid text-xs"
              style={{
                gridTemplateColumns: `repeat(${visibleNav.length}, minmax(0, 1fr))`,
              }}
            >
              {visibleNav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="py-3 text-center text-slate-700 hover:text-brand-600"
                >
                  {n.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
        </ToastProvider>
      </body>
    </html>
  );
}

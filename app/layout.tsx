import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});
import { HydrateStores } from "@/components/HydrateStores";
import { ToastProvider } from "@/components/Toast";
import { getMembership } from "@/lib/auth/getMembership";

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
  { href: "/week", label: "Week" },
  { href: "/gas", label: "Gas" },
  { href: "/mileage", label: "Mileage" },
  { href: "/settings", label: "Settings" },
];

function NotAMemberScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-sm w-full bg-white rounded-xl border border-slate-200 p-6 text-center space-y-4">
        <h1 className="text-lg font-semibold">You&apos;re not on a carpool yet</h1>
        <p className="text-sm text-slate-600">
          Your account isn&apos;t linked to a carpool roster. Ask the driver to
          link your account from the Members page so you can see trips and
          payments.
        </p>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-sm text-slate-600 underline">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const membership = await getMembership();

  if (membership.status === "not-a-member") {
    return (
      <html lang="en" className={cn("font-sans", inter.variable)}>
        <body>
          <NotAMemberScreen />
        </body>
      </html>
    );
  }

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
                <Link href="/admin/members" className="hover:underline">Members</Link>
                <form action="/auth/signout" method="post">
                  <button type="submit" className="hover:underline">Sign out</button>
                </form>
              </div>
            </div>
          </header>
          <main className="flex-1 max-w-3xl w-full mx-auto p-4 pb-24">{children}</main>
          <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200">
            <div className="max-w-3xl mx-auto grid grid-cols-6 text-xs">
              {nav.map((n) => (
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

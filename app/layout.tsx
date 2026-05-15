import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});
import { HydrateStores } from "@/components/HydrateStores";

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", inter.variable)}>
      <body>
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
      </body>
    </html>
  );
}

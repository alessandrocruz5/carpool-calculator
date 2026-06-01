import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});
import { HydrateStores } from "@/components/HydrateStores";
import { ToastProvider } from "@/components/Toast";
import { SyncIssues } from "@/components/SyncIssues";
import { ConnectionStatus } from "@/components/ui/connection-status";
import { ServiceWorkerUpdate } from "@/components/ServiceWorkerUpdate";
import { InstallBanner } from "@/components/InstallBanner";
import { AccountMenu } from "@/components/nav/AccountMenu";
import { BottomNav } from "@/components/nav/BottomNav";
import { WhatsNew } from "@/components/WhatsNew";
import { OnboardingTour } from "@/components/OnboardingTour";
import { getLatestVersion } from "@/lib/changelog";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata: Metadata = {
  title: "Sabay",
  description: "Per-leg carpool cost split",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sabay",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Middleware (lib/supabase/middleware.ts) already resolved the session and
  // looked up the caller's member row; it forwarded both via request headers
  // so we don't have to make the same two Supabase round-trips here.
  const h = await headers();
  const role = h.get("x-user-role");
  const latestVersion = getLatestVersion();

  return (
    <html lang="en" className={cn("font-sans", inter.variable)}>
      <body>
        <ToastProvider>
        <HydrateStores />
        <SyncIssues />
        <ServiceWorkerUpdate />
        <WhatsNew latestVersion={latestVersion} />
        <div className="min-h-screen flex flex-col">
          <ConnectionStatus />
          <InstallBanner />
          <header className="relative z-40 bg-brand-600 text-white px-4 py-3 shadow">
            <div className="max-w-3xl mx-auto flex items-center justify-between">
              <Link href="/" className="font-semibold">Sabay</Link>
              <AccountMenu role={role} />
            </div>
          </header>
          <main className="flex-1 max-w-3xl w-full mx-auto p-4 pb-24">{children}</main>
          <footer className="max-w-3xl mx-auto w-full px-4 pb-28 pt-4 text-xs text-slate-500">
            <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center">
              <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
              <Link href="/legal/terms" className="hover:underline">Terms</Link>
              <Link href="/legal/contact" className="hover:underline">Contact</Link>
              <Link href="/changelog" className="hover:underline">Changelog</Link>
            </div>
          </footer>
          <BottomNav role={role} />
        </div>
        <OnboardingTour />
        </ToastProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

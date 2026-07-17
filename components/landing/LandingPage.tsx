import Link from "next/link";

// Public marketing/explainer page shown at `/` to signed-out visitors.
// Self-contained: it brings its own header, footer and CTA so the root
// layout can render it without the authed app shell / bottom nav.
export function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      <header className="w-full border-b border-slate-100">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold text-brand-700">Sabay</span>
          <Link
            href="/auth/login"
            className="text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-5xl mx-auto px-4 pt-16 pb-12 text-center">
          <span className="inline-block rounded-full bg-brand-50 text-brand-700 text-xs font-medium px-3 py-1">
            Carpool cost splitting, done right
          </span>
          <h1 className="mt-5 text-4xl sm:text-5xl font-bold tracking-tight">
            Split the drive,{" "}
            <span className="text-brand-600">not the friendship</span>.
          </h1>
          <p className="mt-5 max-w-2xl mx-auto text-lg text-slate-600">
            Sabay works out exactly what each passenger owes the driver for every
            carpool — per leg, with a driver-favored ratio that keeps the person
            behind the wheel fairly rewarded.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/auth/login"
              className="w-full sm:w-auto rounded-lg bg-brand-600 px-6 py-3 text-white font-medium shadow-sm hover:bg-brand-700 transition-colors"
            >
              Get started
            </Link>
            <Link
              href="/auth/login"
              className="w-full sm:w-auto rounded-lg border border-slate-300 px-6 py-3 font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Sign in
            </Link>
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Free · invite-only groups · works offline as a home-screen app
          </p>
        </section>

        {/* Visual: driver-favored split */}
        <section className="max-w-3xl mx-auto px-4 pb-12">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <p className="text-sm font-medium text-slate-500">
              A trip with 2 passengers
            </p>
            <div className="mt-4 space-y-3">
              <SplitBar label="Driver keeps" percent={75} tone="driver" />
              <SplitBar label="Passenger 1" percent={12.5} tone="rider" />
              <SplitBar label="Passenger 2" percent={12.5} tone="rider" />
            </div>
            <p className="mt-4 text-xs text-slate-500">
              The driver-favored ratio scales with how many people ride: the more
              passengers share the car, the smaller each share — and the driver&apos;s
              cut stays fair. Ratios are configurable per group.
            </p>
          </div>
        </section>

        {/* How it works */}
        <section className="max-w-5xl mx-auto px-4 pb-16">
          <h2 className="text-center text-2xl font-semibold">How the split works</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            <Feature
              title="Per leg, not per day"
              body="Morning and evening are costed separately, so someone who only rides one way pays for one way. Add as many legs as the day needs."
            />
            <Feature
              title="Driver-favored ratio"
              body="Gas, toll and parking are split by a ratio that rewards the driver — 40/60 with one passenger, tightening as more people pile in."
            />
            <Feature
              title="Detours charged fairly"
              body="Extra distance for a single rider's drop-off is billed 100% to that rider, on top of the shared base — no one subsidizes someone else's detour."
            />
          </div>
        </section>

        {/* Closing CTA */}
        <section className="bg-brand-600">
          <div className="max-w-5xl mx-auto px-4 py-14 text-center text-white">
            <h2 className="text-2xl sm:text-3xl font-semibold">
              Ready to settle up the easy way?
            </h2>
            <p className="mt-3 text-brand-50">
              Create a group, invite your carpool, and let the math take care of itself.
            </p>
            <Link
              href="/auth/login"
              className="mt-7 inline-block rounded-lg bg-white px-6 py-3 font-medium text-brand-700 shadow-sm hover:bg-brand-50 transition-colors"
            >
              Get started
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100">
        <div className="max-w-5xl mx-auto px-4 py-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span>© {new Date().getFullYear()} Sabay</span>
          <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
          <Link href="/legal/terms" className="hover:underline">Terms</Link>
          <Link href="/legal/contact" className="hover:underline">Contact</Link>
        </div>
      </footer>
    </div>
  );
}

function SplitBar({
  label,
  percent,
  tone,
}: {
  label: string;
  percent: number;
  tone: "driver" | "rider";
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-sm text-slate-600">{label}</span>
      <div className="flex-1 h-6 rounded-md bg-slate-200 overflow-hidden">
        <div
          className={
            tone === "driver"
              ? "h-full bg-brand-600"
              : "h-full bg-brand-300"
          }
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-sm font-medium text-slate-700">
        {percent}%
      </span>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-brand-700">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </div>
  );
}

"use client";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAccess } from "@/lib/auth/useAccess";

const DONE_KEY = "cc:onboarding:done";
const PENDING_KEY = "cc:onboarding:pending";
export const ONBOARDING_START_EVENT = "cc:onboarding:start";

type Step = {
  target: string;
  title: string;
  body: string;
  /**
   * Route that renders this step's anchor; the tour navigates there before
   * highlighting. Omit for layout chrome (bottom nav / account menu) that is
   * present on every route.
   */
  route?: string;
  /** Driver-only surfaces are skipped for passengers, whose nav hides them. */
  driverOnly?: boolean;
};

const ALL_STEPS: Step[] = [
  {
    target: "nav-trip",
    title: "Build today's trip",
    body: "This is your home base — pick riders and the app splits each leg's cost.",
  },
  {
    target: "tour-detours",
    route: "/",
    title: "Charge detours per rider",
    body: "Switch a leg to Detours to add each passenger's extra distance on top of the shared split.",
  },
  {
    target: "nav-log",
    title: "Log your trips here",
    body: "Tap Log each day to record who rode along.",
  },
  {
    target: "nav-payments",
    driverOnly: true,
    title: "Settle up here",
    body: "See who owes what and mark payments paid once you're squared away.",
  },
  {
    target: "tour-cars",
    route: "/cars",
    driverOnly: true,
    title: "Manage your cars",
    body: "Add each car with its seats and mileage so costs use the right vehicle.",
  },
  {
    target: "nav-gas",
    driverOnly: true,
    title: "Update gas weekly",
    body: "Open Gas and set the current fuel price each week so splits stay accurate.",
  },
  {
    target: "nav-settings",
    driverOnly: true,
    title: "Settings live here",
    body: "Tweak split percentages, tolls, car mileage, and other trip defaults.",
  },
  {
    target: "nav-members",
    driverOnly: true,
    title: "Invite your carpool",
    body: "Open the account menu (top-right) and tap Members to add drivers and passengers.",
  },
];

export function OnboardingTour() {
  const router = useRouter();
  const pathname = usePathname();
  const { isPassenger } = useAccess();

  const steps = useMemo(
    () => (isPassenger ? ALL_STEPS.filter((s) => !s.driverOnly) : ALL_STEPS),
    [isPassenger],
  );

  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // The step list can shrink once the role resolves to passenger; keep the
  // cursor in range so we never index past the end.
  const clampedStep = Math.min(step, steps.length - 1);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DONE_KEY)) return;
    if (localStorage.getItem(PENDING_KEY)) {
      localStorage.removeItem(PENDING_KEY);
      setStep(0);
      setActive(true);
    }
    const start = () => {
      setStep(0);
      setActive(true);
    };
    window.addEventListener(ONBOARDING_START_EVENT, start);
    return () => window.removeEventListener(ONBOARDING_START_EVENT, start);
  }, []);

  // Navigate to the page that renders the current step's anchor before
  // measuring, so every step resolves to a real on-screen element regardless
  // of where the tour was launched.
  useEffect(() => {
    if (!active) return;
    const route = steps[clampedStep]?.route;
    if (route && pathname !== route) router.push(route);
  }, [active, clampedStep, steps, pathname, router]);

  useLayoutEffect(() => {
    if (!active) return;
    const target = steps[clampedStep]?.target;
    if (!target) return;
    let timer = 0;
    let tries = 0;
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      if (el) {
        setRect(el.getBoundingClientRect());
        return;
      }
      setRect(null);
      // The anchor may still be mounting after a route change; retry briefly.
      if (tries++ < 40) timer = window.setTimeout(measure, 100);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [active, clampedStep, steps]);

  if (!active) return null;
  const current = steps[clampedStep];
  if (!current) return null;
  const isLast = clampedStep === steps.length - 1;

  function finish() {
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {}
    setActive(false);
  }

  function next() {
    if (isLast) finish();
    else setStep((s) => s + 1);
  }

  const isFirst = clampedStep === 0;

  function back() {
    if (isFirst) return;
    // Decrementing re-runs the navigate + measure effects, so the prior step's
    // anchor is re-routed to and re-measured just like a forward move.
    setStep(() => clampedStep - 1);
  }

  const tooltipStyle: React.CSSProperties = (() => {
    if (!rect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
    const width = 280;
    const margin = 12;
    const above = rect.top > window.innerHeight / 2;
    const top = above ? Math.max(margin, rect.top - 8 - 140) : rect.bottom + 8;
    const centerX = rect.left + rect.width / 2;
    const left = Math.min(
      window.innerWidth - width - margin,
      Math.max(margin, centerX - width / 2),
    );
    return { top, left, width };
  })();

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="App tour"
    >
      <div className="absolute inset-0 bg-black/40" onClick={finish} />
      {rect && (
        <div
          className="absolute rounded-lg ring-4 ring-brand-400 pointer-events-none transition-all"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
          }}
        />
      )}
      <div
        className="absolute bg-white rounded-xl shadow-xl p-4 space-y-3"
        style={tooltipStyle}
      >
        <div>
          <div className="text-xs text-slate-500">
            Step {clampedStep + 1} of {steps.length}
          </div>
          <h3 className="font-semibold text-sm mt-0.5">{current.title}</h3>
          <p className="text-sm text-slate-600 mt-1">{current.body}</p>
        </div>
        <div className="flex justify-between items-center pt-1">
          <button
            onClick={finish}
            className="text-xs text-slate-500 underline"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={back}
                className="text-slate-600 text-sm rounded-lg border border-slate-200 px-3 py-1.5"
              >
                Back
              </button>
            )}
            <button
              onClick={next}
              className="bg-brand-600 text-white text-sm rounded-lg px-3 py-1.5"
            >
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function markOnboardingPending() {
  try {
    localStorage.setItem(PENDING_KEY, "1");
  } catch {}
}

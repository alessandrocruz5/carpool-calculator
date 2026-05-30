"use client";
import { useEffect, useLayoutEffect, useState } from "react";

const DONE_KEY = "cc:onboarding:done";
const PENDING_KEY = "cc:onboarding:pending";
export const ONBOARDING_START_EVENT = "cc:onboarding:start";

type Step = {
  target: string;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    target: "nav-log",
    title: "Log your trips here",
    body: "Tap Log each day to record who rode along.",
  },
  {
    target: "nav-settings",
    title: "Settings live here",
    body: "Tweak split percentages, tolls, and trip defaults.",
  },
  {
    target: "nav-members",
    title: "Invite your carpool",
    body: "Add drivers and passengers from Members at the top.",
  },
  {
    target: "nav-gas",
    title: "Track fill-ups",
    body: "Log fuel stops so the app knows your real km/L.",
  },
];

export function OnboardingTour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

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

  useLayoutEffect(() => {
    if (!active) return;
    const target = STEPS[step]?.target;
    if (!target) return;
    const update = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, step]);

  if (!active) return null;
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

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
            Step {step + 1} of {STEPS.length}
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
          <button
            onClick={next}
            className="bg-brand-600 text-white text-sm rounded-lg px-3 py-1.5"
          >
            {isLast ? "Done" : "Next"}
          </button>
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

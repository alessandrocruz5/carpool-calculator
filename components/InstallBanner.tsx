"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const SEEN_KEY = "carpool.install-banner.seen";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari sets navigator.standalone; other browsers use display-mode.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true
  );
}

export function InstallBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(SEEN_KEY)) return;
    if (isStandalone()) {
      localStorage.setItem(SEEN_KEY, "1");
      return;
    }
    setShow(true);
  }, []);

  if (!show) return null;

  const dismiss = () => {
    localStorage.setItem(SEEN_KEY, "1");
    setShow(false);
  };

  return (
    <div className="bg-brand-50 border-b border-brand-200 text-brand-900 text-xs px-3 py-1.5 flex items-center justify-between gap-3">
      <span>
        Install Sabay to your home screen for quicker access.{" "}
        <Link href="/install" className="underline font-medium" onClick={dismiss}>
          How
        </Link>
      </span>
      <button
        onClick={dismiss}
        aria-label="Dismiss install banner"
        className="opacity-80 hover:opacity-100 text-base leading-none px-1"
      >
        ×
      </button>
    </div>
  );
}

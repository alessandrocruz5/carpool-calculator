"use client";
import Script from "next/script";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

/** True when a Turnstile site key is configured; false in dev with no key. */
export const turnstileEnabled = Boolean(SITE_KEY);

type TurnstileRenderOpts = {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
};

type TurnstileApi = {
  render: (el: HTMLElement, opts: TurnstileRenderOpts) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export interface TurnstileHandle {
  /** Clear the current token and re-arm the widget (tokens are single-use). */
  reset: () => void;
}

interface TurnstileProps {
  /** Fired with a fresh token when solved, or null when cleared/expired. */
  onToken: (token: string | null) => void;
}

/**
 * Cloudflare Turnstile CAPTCHA widget. Renders nothing when
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is unset, so local dev degrades cleanly
 * (see "optional integrations degrade cleanly" in CLAUDE.md). Supabase verifies
 * the token server-side with the secret configured in its dashboard.
 */
export const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(
  function Turnstile({ onToken }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const onTokenRef = useRef(onToken);
    const [scriptLoaded, setScriptLoaded] = useState(false);

    // Keep the latest callback without re-running the render effect (which would
    // tear down and re-create the widget on every parent re-render).
    useEffect(() => {
      onTokenRef.current = onToken;
    });

    useImperativeHandle(ref, () => ({
      reset() {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
          onTokenRef.current(null);
        }
      },
    }), []);

    useEffect(() => {
      if (!SITE_KEY || !scriptLoaded || !window.turnstile) return;
      const container = containerRef.current;
      if (!container || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(container, {
        sitekey: SITE_KEY,
        callback: (token) => onTokenRef.current(token),
        "expired-callback": () => onTokenRef.current(null),
        "error-callback": () => onTokenRef.current(null),
      });
      return () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
    }, [scriptLoaded]);

    if (!SITE_KEY) return null;

    return (
      <>
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setScriptLoaded(true)}
        />
        <div ref={containerRef} className="flex justify-center" />
      </>
    );
  }
);

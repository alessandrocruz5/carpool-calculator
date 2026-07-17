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
  ready: (cb: () => void) => void;
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
    const [failed, setFailed] = useState(false);

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
      if (!SITE_KEY) return;
      let cancelled = false;
      let pollId: number | undefined;

      // The Turnstile API may already be cached from a previous mount (e.g. an
      // auth-mode switch), in which case next/script's one-shot `onLoad` never
      // fires again. Poll for the global instead of relying on it, then render
      // via `ready()` (fires immediately when the API is already initialized).
      const setup = (): boolean => {
        if (!window.turnstile) return false;
        window.turnstile.ready(() => {
          const container = containerRef.current;
          if (cancelled || widgetIdRef.current || !container || !window.turnstile)
            return;
          widgetIdRef.current = window.turnstile.render(container, {
            sitekey: SITE_KEY,
            callback: (token) => onTokenRef.current(token),
            "expired-callback": () => onTokenRef.current(null),
            "error-callback": () => onTokenRef.current(null),
          });
        });
        return true;
      };

      if (!setup()) {
        pollId = window.setInterval(() => {
          if (cancelled || setup()) window.clearInterval(pollId);
        }, 200);
      }

      // Surface a dead-end if the widget never loads (ad blocker, CSP, network),
      // rather than leaving the submit button silently disabled forever.
      const timeoutId = window.setTimeout(() => {
        if (!cancelled && !widgetIdRef.current) setFailed(true);
      }, 15000);

      return () => {
        cancelled = true;
        if (pollId) window.clearInterval(pollId);
        window.clearTimeout(timeoutId);
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
    }, []);

    if (!SITE_KEY) return null;

    return (
      <>
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
        />
        <div ref={containerRef} className="flex justify-center" />
        {failed && (
          <p className="text-sm text-red-600">
            Couldn&apos;t load the verification widget. Disable any ad blocker,
            then refresh to continue.
          </p>
        )}
      </>
    );
  }
);

"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        {/* `NextError` is the default Next.js error page component. Its type
        definition requires a `statusCode` prop. However, since the App Router
        does not expose status codes for errors, we simply pass 0 to render a
        generic error message. */}
        <NextError statusCode={0} />
        <div className="min-h-screen flex flex-col">
          <header className="bg-brand-600 text-white px-4 py-3 shadow">
            <div className="max-w-3xl mx-auto flex items-center justify-between">
              <span className="font-semibold">Sabay</span>
            </div>
          </header>
          <main className="flex-1 max-w-3xl w-full mx-auto p-4">
            <div className="space-y-4">
              <div>
                <h1 className="text-xl font-semibold">Something went wrong</h1>
                <p className="text-xs text-slate-500">
                  A critical error broke the app. Try reloading.
                </p>
              </div>

              <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <p className="text-sm text-slate-700">
                  {error.message || "Unknown error"}
                </p>
                {error.digest && (
                  <p className="text-xs text-slate-500">
                    Reference: {error.digest}
                  </p>
                )}
                <button
                  onClick={() => window.location.reload()}
                  className="bg-brand-600 text-white text-sm font-medium rounded-lg px-4 py-2"
                >
                  Try again
                </button>
              </section>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}

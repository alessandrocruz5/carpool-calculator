"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
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
                  onClick={reset}
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

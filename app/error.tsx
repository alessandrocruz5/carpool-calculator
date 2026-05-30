"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
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
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-xs text-slate-500">
          An unexpected error occurred. You can try again or head back home.
        </p>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-sm text-slate-700">
          {error.message || "Unknown error"}
        </p>
        {error.digest && (
          <p className="text-xs text-slate-500">Reference: {error.digest}</p>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={reset}
            className="bg-brand-600 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            Try again
          </button>
          <Link
            href="/"
            className="text-sm text-brand-600 hover:underline px-2 py-2"
          >
            Go home
          </Link>
        </div>
      </section>
    </div>
  );
}

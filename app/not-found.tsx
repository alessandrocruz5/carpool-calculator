import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-xs text-slate-500">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
      </div>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <p className="text-sm text-slate-700">
          Check the URL, or head back to the home page.
        </p>
        <Link
          href="/"
          className="inline-block bg-brand-600 text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          Go home
        </Link>
      </section>
    </div>
  );
}

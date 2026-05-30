import type { LucideIcon } from "lucide-react";
import Link from "next/link";

type EmptyStateProps = {
  icon: LucideIcon;
  headline: string;
  cta?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
};

export function EmptyState({ icon: Icon, headline, cta }: EmptyStateProps) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col items-center text-center gap-3">
      <Icon className="w-10 h-10 text-slate-400" aria-hidden="true" />
      <p className="text-sm text-slate-600">{headline}</p>
      {cta &&
        (cta.href ? (
          <Link
            href={cta.href}
            className="inline-block bg-brand-600 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            {cta.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={cta.onClick}
            className="bg-brand-600 text-white text-sm font-medium rounded-lg px-4 py-2"
          >
            {cta.label}
          </button>
        ))}
    </section>
  );
}

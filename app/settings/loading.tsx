import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-28" />

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-9 w-24" />
          </div>
        ))}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <Skeleton className="h-5 w-28" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex justify-between items-center">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
        <Skeleton className="h-10 w-full" />
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-32" />
      </section>
    </div>
  );
}

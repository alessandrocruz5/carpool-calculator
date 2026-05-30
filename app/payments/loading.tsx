import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-40" />

      <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="flex justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-20" />
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-7 w-20" />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

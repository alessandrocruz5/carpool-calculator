"use client";

/** Native date input clamped to `[min, max]` (inclusive). Used to constrain
 * trip-date selection to `lib/retro.ts`'s Sunday-anchored backfill window. */
export function DatePicker({
  value,
  min,
  max,
  onChange,
  className,
}: {
  value: string;
  min: string;
  max: string;
  onChange: (date: string) => void;
  className?: string;
}) {
  return (
    <input
      type="date"
      aria-label="Trip date"
      value={value}
      min={min}
      max={max}
      onChange={(e) => {
        const next = e.target.value;
        if (!next || next < min || next > max) return;
        onChange(next);
      }}
      className={
        "border border-slate-300 rounded-lg px-2 py-1.5 text-sm " + (className ?? "")
      }
    />
  );
}

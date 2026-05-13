"use client";

export interface PassengerOption {
  id: string;
  name: string;
}

export function PassengerChips({
  options,
  selected,
  onChange,
}: {
  options: PassengerOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else if (selected.length < 3) onChange([...selected, id]);
  }
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((p) => {
        const on = selected.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => toggle(p.id)}
            className={
              "px-3 py-1.5 rounded-full text-sm border " +
              (on
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50")
            }
          >
            {p.name}
          </button>
        );
      })}
      {options.length === 0 && (
        <span className="text-sm text-slate-500">No passengers added yet — visit Settings.</span>
      )}
    </div>
  );
}

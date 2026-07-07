"use client";
import { useEffect, useRef, useState } from "react";
import type { InputHTMLAttributes } from "react";

export function NumericInput({
  value,
  onChange,
  integer,
  ...inputProps
}: {
  value: number;
  onChange: (n: number) => void;
  integer?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [display, setDisplay] = useState(() => String(value));
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDisplay(String(value));
  }, [value]);

  function parse(s: string): number | null {
    const n = integer ? parseInt(s, 10) : parseFloat(s);
    return isNaN(n) ? null : n;
  }

  return (
    <input
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      value={display}
      onFocus={() => {
        editing.current = true;
      }}
      onChange={(e) => {
        setDisplay(e.target.value);
        const n = parse(e.target.value);
        if (n !== null) onChange(n);
      }}
      onBlur={() => {
        editing.current = false;
        const n = parse(display);
        if (n === null) {
          setDisplay(String(value));
        } else {
          onChange(n);
          setDisplay(String(n));
        }
      }}
      {...inputProps}
    />
  );
}

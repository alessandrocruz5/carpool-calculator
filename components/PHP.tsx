export function PHP({ value, className = "" }: { value: number; className?: string }) {
  const formatted = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return <span className={className}>{formatted}</span>;
}

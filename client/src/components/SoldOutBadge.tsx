export default function SoldOutBadge({ className = "" }: { className?: string }) {
  return (
    <span
      aria-label="Sold out"
      className={`inline-flex items-center rounded-full border border-red-300/50 bg-red-600 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-white shadow-lg shadow-red-950/40 ${className}`}
    >
      SOLD OUT
    </span>
  );
}

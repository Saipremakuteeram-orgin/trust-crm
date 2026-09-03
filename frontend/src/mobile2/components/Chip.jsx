export default function Chip({ label, active, onClick, className = "" }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`m-tap shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
        active
          ? "bg-royal-600 text-white shadow-md shadow-royal-500/20"
          : "bg-white text-stone-600 border border-stone-200 active:bg-stone-50"
      } ${className}`}
    >
      {label}
    </button>
  );
}

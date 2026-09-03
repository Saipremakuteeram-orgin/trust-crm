export default function FilterChips({ options, value, onChange }) {
  return (
    <div className="flex gap-2 overflow-x-auto m-snap-x px-1 pb-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`m-tap shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
            value === opt.value
              ? "bg-royal-600 text-white shadow-md shadow-royal-500/20"
              : "bg-white text-stone-600 border border-stone-200 active:bg-stone-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

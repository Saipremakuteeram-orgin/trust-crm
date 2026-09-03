import { useCallback } from "react";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"];

export default function NumericPad({ value, onChange }) {
  const press = useCallback((key) => {
    if (key === "back") {
      const next = String(value).slice(0, -1);
      onChange(next);
      return;
    }
    if (key === "." && String(value).includes(".")) return;
    onChange(String(value) + key);
  }, [value, onChange]);

  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => press(k)}
          aria-label={k === "back" ? "Backspace" : k}
          className={`m-tap h-14 rounded-2xl text-lg font-bold active:scale-95 transition-transform ${
            k === "back" ? "bg-stone-200 text-stone-700" : "bg-white text-stone-900 border border-stone-200"
          }`}
        >
          {k === "back" ? "⌫" : k}
        </button>
      ))}
    </div>
  );
}

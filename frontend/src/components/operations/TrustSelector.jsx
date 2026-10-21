import { ALL_TRUSTS_ID, getTrustOptions } from "../../lib/operationsApi";

export default function TrustSelector({
  trusts,
  value,
  onChange,
  allowAll = true,
  disabled = false,
  label = "Trust context",
  id = "operations-trust-selector",
}) {
  const options = getTrustOptions(trusts, allowAll);

  return (
    <div className="min-w-64">
      <label htmlFor={id} className="flex flex-col gap-1.5 text-xs font-semibold uppercase tracking-wider text-stone-500">
        {label}
        <select
          id={id}
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-stone-800 outline-none transition-colors focus:border-saffron-400 focus:ring-2 focus:ring-saffron-100 disabled:cursor-not-allowed disabled:bg-stone-50"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {allowAll && value === ALL_TRUSTS_ID && (
        <p className="mt-1.5 text-xs text-stone-500" role="note">
          All trusts is read-only. Select one trust before changing records.
        </p>
      )}
    </div>
  );
}

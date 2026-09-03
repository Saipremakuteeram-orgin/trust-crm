export default function CategoryDonut({ slices = [], size = 96, thickness = 14 }) {
  const total = slices.reduce((s, x) => s + Math.max(0, Number(x.value) || 0), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f5f5f4" strokeWidth={thickness} />
        {total > 0 && slices.map((s, i) => {
          const v = Math.max(0, Number(s.value) || 0);
          const frac = v / total;
          const dash = c * frac;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${c - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="butt"
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <ul className="flex-1 min-w-0 space-y-1">
        {slices.slice(0, 5).map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="flex-1 truncate text-stone-600">{s.label}</span>
            <span className="font-semibold text-stone-700">{total ? Math.round((Number(s.value) / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

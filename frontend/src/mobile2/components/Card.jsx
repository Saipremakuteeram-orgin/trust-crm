export default function Card({ children, className = "", onClick, padding = true }) {
  const interactive = typeof onClick === "function";
  return (
    <div
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); } } : undefined}
      className={`bg-white rounded-3xl shadow-soft border border-stone-200/60 ${padding ? "p-5" : ""} ${interactive ? "cursor-pointer active:scale-[0.98] transition-transform" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

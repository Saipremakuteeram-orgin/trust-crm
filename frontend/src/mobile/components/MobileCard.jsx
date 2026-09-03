export function MobileCard({ children, className = "", onClick, ...rest }) {
  const interactive = typeof onClick === "function";
  return (
    <div
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); } } : undefined}
      className={`m-card ${interactive ? "cursor-pointer active:scale-[0.99] transition-transform" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export default MobileCard;

import { useRef, useState } from "react";

export default function SwipeableRow({ leftActions, rightActions, children, className = "" }) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(null);
  const dragging = useRef(false);

  const maxLeft = (leftActions?.length || 0) * 80;
  const maxRight = (rightActions?.length || 0) * 80;
  if (!leftActions && !rightActions) return <div className={className}>{children}</div>;

  const onStart = (e) => { startX.current = e.touches[0].clientX; dragging.current = true; };
  const onMove = (e) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    let next = offset + dx;
    if (next > maxLeft) next = maxLeft;
    if (next < -maxRight) next = -maxRight;
    setOffset(next);
    startX.current = e.touches[0].clientX;
  };
  const onEnd = () => {
    dragging.current = false;
    if (offset > 40 && maxLeft) setOffset(maxLeft);
    else if (offset < -40 && maxRight) setOffset(-maxRight);
    else setOffset(0);
  };

  return (
    <div className={`relative overflow-hidden ${className}`} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}>
      {leftActions && offset > 0 && (
        <div className="absolute inset-y-0 left-0 flex" style={{ width: maxLeft }}>
          {leftActions.map((a, i) => (
            <button key={i} onClick={() => { a.onClick(); setOffset(0); }}
              className={`w-20 flex items-center justify-center text-white text-xs font-semibold ${a.color || "bg-saffron-500"}`}>
              {a.label}
            </button>
          ))}
        </div>
      )}
      {rightActions && offset < 0 && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: maxRight }}>
          {rightActions.map((a, i) => (
            <button key={i} onClick={() => { a.onClick(); setOffset(0); }}
              className={`w-20 flex items-center justify-center text-white text-xs font-semibold ${a.color || "bg-rose-500"}`}>
              {a.label}
            </button>
          ))}
        </div>
      )}
      <div style={{ transform: `translateX(${offset}px)`, transition: dragging.current ? "none" : "transform 0.2s" }}>
        {children}
      </div>
    </div>
  );
}

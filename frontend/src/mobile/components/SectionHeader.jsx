export default function SectionHeader({ title, action, className = "" }) {
  return (
    <div className={`flex items-center justify-between px-4 pt-5 pb-2 ${className}`}>
      <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">{title}</h2>
      {action}
    </div>
  );
}

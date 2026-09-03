export default function SectionTitle({ title, action }) {
  return (
    <div className="flex items-center justify-between px-1 pt-5 pb-2">
      <h2 className="text-xs font-bold uppercase tracking-wider text-stone-500">{title}</h2>
      {action}
    </div>
  );
}

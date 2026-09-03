export default function EmptyState({ icon, title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-10 gap-3">
      {icon != null && (
        <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center text-stone-400">
          {icon}
        </div>
      )}
      <div>
        <p className="text-sm font-semibold text-stone-700">{title}</p>
        {message != null && <p className="text-xs text-stone-500 mt-1">{message}</p>}
      </div>
      {action}
    </div>
  );
}

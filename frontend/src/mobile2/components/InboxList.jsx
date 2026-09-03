export default function InboxList({ items }) {
  if (!items?.length) return <div className="text-center text-xs text-stone-400 py-8">No notifications yet.</div>;
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="bg-white rounded-3xl shadow-soft border border-stone-200/60 p-4">
          <div className="text-sm font-semibold text-stone-800">{item.title || item.subject || item.action || "Notification"}</div>
          <div className="text-[11px] text-stone-500 mt-0.5">{item.body || item.message || ""}</div>
          <div className="text-[10px] text-stone-400 mt-1">{item.created_at || item.timestamp || ""}</div>
        </div>
      ))}
    </div>
  );
}

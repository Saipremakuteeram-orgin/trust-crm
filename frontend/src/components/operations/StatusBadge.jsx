import { humanizeStatus } from "../../lib/operationsApi";

const tones = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  approved: "bg-sky-50 text-sky-700 ring-sky-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  draft: "bg-stone-100 text-stone-600 ring-stone-200",
  failed: "bg-rose-50 text-rose-700 ring-rose-200",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  pending_approval: "bg-amber-50 text-amber-700 ring-amber-200",
  processing: "bg-sky-50 text-sky-700 ring-sky-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  retrying: "bg-orange-50 text-orange-700 ring-orange-200",
  sent: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  cancelled: "bg-stone-100 text-stone-500 ring-stone-200",
};

export default function StatusBadge({ status, label }) {
  const normalizedStatus = String(status || "unknown");
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ring-1 ${tones[normalizedStatus] || tones.draft}`}
      aria-label={`Status: ${label || humanizeStatus(normalizedStatus)}`}
    >
      {label || humanizeStatus(normalizedStatus)}
    </span>
  );
}

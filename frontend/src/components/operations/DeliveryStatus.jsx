import StatusBadge from "./StatusBadge";

export default function DeliveryStatus({ status, attempts, lastError }) {
  const attemptCount = Number(attempts || 0);
  return (
    <div className="space-y-1.5">
      <StatusBadge status={status} />
      <div className="text-xs text-stone-500">
        {attemptCount ? `${attemptCount} attempt${attemptCount === 1 ? "" : "s"}` : "No attempts recorded"}
      </div>
      {lastError && (
        <p className="max-w-xs truncate text-xs text-rose-600" title={lastError}>
          {lastError}
        </p>
      )}
    </div>
  );
}

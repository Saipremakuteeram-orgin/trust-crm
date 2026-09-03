import { useOnlineStatus } from "../hooks";

export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="sticky top-0 z-40 bg-amber-50 border-b border-amber-200 px-4 py-2">
      <p className="text-xs font-semibold text-amber-800 text-center">You are offline. Writes are disabled. Cached data shown.</p>
    </div>
  );
}

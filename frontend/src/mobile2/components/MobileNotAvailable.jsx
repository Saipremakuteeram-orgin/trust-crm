import DeepLinkCard from "./DeepLinkCard";

const DENSE = ["/mobile/spreadsheet", "/mobile/trial-balance", "/mobile/reports", "/mobile/bank-reconciliation"];

export function isDenseRoute(pathname) {
  return DENSE.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function getDeepLinkHref(pathname) {
  const map = {
    "/mobile/spreadsheet": "/spreadsheet",
    "/mobile/trial-balance": "/trial-balance",
    "/mobile/reports": "/reports",
    "/mobile/bank-reconciliation": "/bank-reconciliation",
    "/mobile/ledger": "/ledger",
  };
  const exact = map[pathname];
  if (exact) return exact;
  for (const [k, v] of Object.entries(map)) {
    if (pathname.startsWith(k)) return v + pathname.slice(k.length);
  }
  return "/dashboard";
}

export default function MobileNotAvailable({ pathname }) {
  const href = getDeepLinkHref(pathname);
  return (
    <div className="px-4 pt-6">
      <DeepLinkCard
        href={href}
        reason="This screen works best on a larger screen. Open the desktop version to continue."
      />
    </div>
  );
}

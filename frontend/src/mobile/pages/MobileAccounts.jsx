import { useEffect, useState } from "react";
import api from "../../lib/api";
import MobileShell from "../MobileShell";
import MobileListItem from "../components/MobileListItem";
import EmptyState from "../components/EmptyState";
import { useToast } from "../../components/Toast";

const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function MobileAccounts() {
  const { addToast } = useToast();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/accounts").then((r) => { setAccounts(r.data.result || []); setLoading(false); }).catch(() => { addToast("Failed to load", "error"); setLoading(false); });
  }, []);

  const grouped = accounts.reduce((acc, a) => {
    const key = a.type || "Other";
    (acc[key] ||= []).push(a);
    return acc;
  }, {});

  return (
    <MobileShell title="Chart of Accounts" subtitle={`${accounts.length} accounts`}>
      {loading ? (
        <div className="p-6 text-center text-sm text-stone-400">Loading…</div>
      ) : accounts.length === 0 ? (
        <EmptyState title="No accounts" message="Create accounts on desktop to use this view." />
      ) : (
        <div className="space-y-3 pb-4">
          {Object.entries(grouped).map(([type, list]) => (
            <div key={type} className="m-card !p-0 mx-4 overflow-hidden">
              <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-stone-500 bg-stone-50">{type}</div>
              <ul className="m-list">
                {list.map((a) => (
                  <MobileListItem
                    key={a.id}
                    onClick={() => window.location.assign(`/ledger/${a.id}`)}
                    title={a.name}
                    subtitle={a.code || a.subtype || ""}
                    trailing={<div className="text-sm font-bold text-stone-700">{fmt(a.balance)}</div>}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </MobileShell>
  );
}

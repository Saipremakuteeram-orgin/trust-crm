import { useParams } from "react-router-dom";
import MobileShell from "../MobileShell";
import MobileDensePlaceholder from "../components/MobileDensePlaceholder";
import MobileListItem from "../components/MobileListItem";

const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function MobileLedgerSummary() {
  const { accountId } = useParams();
  const desktopPath = accountId ? `/ledger/${accountId}` : "/ledger";
  const endpoint = accountId ? `/ledger/${accountId}` : "/accounts";

  return (
    <MobileShell title="General Ledger" subtitle="Summary" showBack>
      <MobileDensePlaceholder
        title="Ledger"
        desktopPath={desktopPath}
        endpoint={endpoint}
        summary="Running balance"
        renderSummary={(data) => {
          if (!data) return null;
          const arr = Array.isArray(data) ? data : (data.entries || data.result || []);
          const total = arr.reduce((s, e) => s + Number(e.amount || 0), 0);
          return (
            <div className="mt-2">
              <div className="text-[10px] uppercase text-stone-500">Net movement</div>
              <div className="text-base font-bold text-stone-800">{fmt(total)}</div>
              <div className="text-[10px] text-stone-400 mt-1">{arr.length} entries</div>
            </div>
          );
        }}
        renderRows={(data, limit) => {
          const arr = Array.isArray(data) ? data : (data?.entries || data?.result || []);
          return arr.slice(0, limit).map((e, i) => (
            <MobileListItem
              key={e.id || i}
              title={e.description || e.memo || "Entry"}
              subtitle={e.entry_date || e.date || ""}
              trailing={
                <div className={`text-sm font-bold ${(e.type === "credit" || Number(e.amount) >= 0) ? "text-emerald-700" : "text-rose-700"}`}>
                  {fmt(e.amount)}
                </div>
              }
            />
          ));
        }}
      />
    </MobileShell>
  );
}

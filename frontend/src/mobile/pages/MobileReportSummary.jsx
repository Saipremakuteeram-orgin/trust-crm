import MobileShell from "../MobileShell";
import MobileDensePlaceholder from "../components/MobileDensePlaceholder";
import MobileListItem from "../components/MobileListItem";

const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function MobileReportSummary() {
  return (
    <MobileShell title="Reports" subtitle="Summary" showBack>
      <MobileDensePlaceholder
        title="Reports"
        desktopPath="/reports"
        endpoint="/reports"
        endpointParams={{ type: "transactions" }}
        summary="This month"
        renderSummary={(data) => {
          if (!data) return null;
          const totalCredit = (data.rows || data.result || []).reduce((s, r) => s + Number(r.credit || r.amount || 0), 0);
          return (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <div className="text-[10px] uppercase text-stone-500">Movements</div>
                <div className="text-base font-bold text-stone-800">{(data.rows || data.result || []).length}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-stone-500">Total inflow</div>
                <div className="text-base font-bold text-emerald-600">{fmt(totalCredit)}</div>
              </div>
            </div>
          );
        }}
        renderRows={(data, limit) => {
          const rows = data?.rows || data?.result || [];
          return rows.slice(0, limit).map((r, i) => (
            <MobileListItem
              key={r.id || i}
              title={r.party || r.description || r.category || "Item"}
              subtitle={r.txn_date || r.date || ""}
              trailing={
                <div className="text-sm font-bold text-stone-800">{fmt(r.amount || r.credit || 0)}</div>
              }
            />
          ));
        }}
      />
    </MobileShell>
  );
}

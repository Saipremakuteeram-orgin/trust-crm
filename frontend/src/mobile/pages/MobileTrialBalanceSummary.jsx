import MobileShell from "../MobileShell";
import MobileDensePlaceholder from "../components/MobileDensePlaceholder";
import MobileListItem from "../components/MobileListItem";

const fmt = (n) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n || 0));

export default function MobileTrialBalanceSummary() {
  return (
    <MobileShell title="Trial Balance" subtitle="Summary" showBack>
      <MobileDensePlaceholder
        title="Trial Balance"
        desktopPath="/trial-balance"
        endpoint="/accounts/trial-balance"
        summary="Totals"
        renderSummary={(data) => {
          if (!data) return null;
          const totalDebit = (data || []).reduce((s, r) => s + Number(r.debit || 0), 0);
          const totalCredit = (data || []).reduce((s, r) => s + Number(r.credit || 0), 0);
          return (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <div className="text-[10px] uppercase text-stone-500">Total Debit</div>
                <div className="text-base font-bold text-rose-600">{fmt(totalDebit)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-stone-500">Total Credit</div>
                <div className="text-base font-bold text-emerald-600">{fmt(totalCredit)}</div>
              </div>
              <div className="col-span-2">
                <div className="text-[10px] uppercase text-stone-500">Difference</div>
                <div className="text-sm font-bold text-stone-800">{fmt(Math.abs(totalDebit - totalCredit))}</div>
              </div>
            </div>
          );
        }}
        renderRows={(data, limit) => {
          if (!data) return null;
          return data.slice(0, limit).map((r) => (
            <MobileListItem
              key={r.account_id || r.id}
              title={r.account_name || r.name}
              subtitle={r.code || ""}
              trailing={
                <div className="text-right text-xs">
                  <div className="text-rose-600 font-semibold">D {fmt(r.debit)}</div>
                  <div className="text-emerald-600 font-semibold">C {fmt(r.credit)}</div>
                </div>
              }
            />
          ));
        }}
      />
    </MobileShell>
  );
}

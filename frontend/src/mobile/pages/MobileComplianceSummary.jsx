import MobileShell from "../MobileShell";
import MobileDensePlaceholder from "../components/MobileDensePlaceholder";
import MobileListItem from "../components/MobileListItem";

export default function MobileComplianceSummary() {
  return (
    <MobileShell title="Compliance" subtitle="Summary" showBack>
      <MobileDensePlaceholder
        title="Compliance"
        desktopPath="/compliance"
        endpoint="/compliance"
        summary="Upcoming items"
        renderSummary={(data) => {
          const list = Array.isArray(data) ? data : (data?.result || []);
          const due = list.filter((i) => i.due_date && new Date(i.due_date) >= new Date()).length;
          return (
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <div className="text-[10px] uppercase text-stone-500">Total items</div>
                <div className="text-base font-bold text-stone-800">{list.length}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-stone-500">Upcoming</div>
                <div className="text-base font-bold text-saffron-600">{due}</div>
              </div>
            </div>
          );
        }}
        renderRows={(data, limit) => {
          const list = Array.isArray(data) ? data : (data?.result || []);
          if (!list.length) return <li className="px-4 py-6 text-center text-xs text-stone-400">No compliance items</li>;
          return list.slice(0, limit).map((c) => (
            <MobileListItem
              key={c.id}
              title={c.title || c.name || "Compliance item"}
              subtitle={c.due_date || c.frequency || ""}
            />
          ));
        }}
      />
    </MobileShell>
  );
}

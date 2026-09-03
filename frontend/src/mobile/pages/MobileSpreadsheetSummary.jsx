import MobileShell from "../MobileShell";
import MobileDensePlaceholder from "../components/MobileDensePlaceholder";

export default function MobileSpreadsheetSummary() {
  return (
    <MobileShell title="Spreadsheet" subtitle="Summary" showBack>
      <MobileDensePlaceholder
        title="Spreadsheet"
        desktopPath="/spreadsheet"
        endpoint="/exports/spreadsheet/download"
        method="post"
        summary="Latest export"
        renderSummary={() => (
          <p className="text-xs text-stone-600 mt-2">
            The full spreadsheet is editable on desktop. On mobile you can preview recent rows and trigger a fresh export.
          </p>
        )}
        renderRows={() => (
          <li className="px-4 py-6 text-center text-xs text-stone-400">
            Open the desktop spreadsheet for cell-level editing.
          </li>
        )}
      />
    </MobileShell>
  );
}

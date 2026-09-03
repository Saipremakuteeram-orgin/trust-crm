import { useNavigate } from "react-router-dom";
import { Users, Receipt } from "lucide-react";

export default function SecondaryActions() {
  const navigate = useNavigate();
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        onClick={() => navigate("/mobile/people?new=1")}
        className="m-tap flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 active:bg-stone-50"
      >
        <div className="w-10 h-10 rounded-xl bg-royal-50 text-royal-600 flex items-center justify-center">
          <Users size={20} />
        </div>
        <div className="text-left">
          <div className="text-sm font-bold text-stone-800">Add contact</div>
          <div className="text-[11px] text-stone-500">New person</div>
        </div>
      </button>
      <button
        onClick={() => navigate("/mobile/money?receipt=1")}
        className="m-tap flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 active:bg-stone-50"
      >
        <div className="w-10 h-10 rounded-xl bg-saffron-50 text-saffron-600 flex items-center justify-center">
          <Receipt size={20} />
        </div>
        <div className="text-left">
          <div className="text-sm font-bold text-stone-800">New receipt</div>
          <div className="text-[11px] text-stone-500">Attach file</div>
        </div>
      </button>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatZOS } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { TxRow } from "@/views/Dashboard";
import { Receipt, Loader2, ArrowUpRight, ArrowDownLeft } from "lucide-react";

type FilterType = "all" | "transfer" | "deposit";
type DirectionFilter = "all" | "in" | "out";

export default function HistoryView() {
  const { profile } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [dirFilter, setDirFilter] = useState<DirectionFilter>("all");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc("get_transaction_history");
      if (!error && data) {
        setTransactions(data as Transaction[]);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (!profile) return null;

  let filtered = transactions;
  if (typeFilter !== "all") {
    filtered = filtered.filter((t) => t.type === typeFilter);
  }
  if (dirFilter !== "all") {
    if (dirFilter === "in") {
      filtered = filtered.filter((t) => t.receiver_id === profile.id);
    } else {
      filtered = filtered.filter((t) => t.sender_id === profile.id);
    }
  }

  const totalIn = transactions
    .filter((t) => t.receiver_id === profile.id)
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalOut = transactions
    .filter((t) => t.sender_id === profile.id)
    .reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white">Transaction History</h1>
        <p className="text-slate-400 text-sm mt-1">All your ZOS activity</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
            Total Received
          </div>
          <p className="text-xl font-bold text-emerald-400">{formatZOS(totalIn)}</p>
          <p className="text-xs text-slate-500">ZOS</p>
        </div>
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
          <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
            <ArrowUpRight className="w-3.5 h-3.5 text-slate-400" />
            Total Sent
          </div>
          <p className="text-xl font-bold text-white">{formatZOS(totalOut)}</p>
          <p className="text-xs text-slate-500">ZOS</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {(["all", "transfer", "deposit"] as FilterType[]).map((t) => (
          <FilterChip
            key={t}
            label={t === "all" ? "All Types" : t === "transfer" ? "Transfers" : "Deposits"}
            active={typeFilter === t}
            onClick={() => setTypeFilter(t)}
          />
        ))}
        <div className="w-px bg-slate-800 mx-1" />
        {(["all", "in", "out"] as DirectionFilter[]).map((d) => (
          <FilterChip
            key={d}
            label={d === "all" ? "All Directions" : d === "in" ? "Received" : "Sent"}
            active={dirFilter === d}
            onClick={() => setDirFilter(d)}
          />
        ))}
      </div>

      {/* List */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-slate-600 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Receipt className="w-10 h-10 text-slate-700 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No transactions match your filters</p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((tx) => (
              <TxRow key={tx.id} tx={tx} currentUserId={profile.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
        active
          ? "bg-teal-500/10 text-teal-400 border border-teal-500/20"
          : "bg-slate-800/50 text-slate-400 border border-slate-700 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

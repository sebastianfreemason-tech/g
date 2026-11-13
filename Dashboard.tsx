import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatZOS, formatDate } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { Copy, Check, ArrowUpRight, ArrowDownLeft, ArrowDownToLine, ArrowUpFromLine, Send, Receipt, Wallet } from "lucide-react";
import type { PageId } from "@/App";

export default function Dashboard({ onNavigate }: { onNavigate: (id: PageId) => void }) {
  const { profile } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [copied, setCopied] = useState(false);
  const [loadingTx, setLoadingTx] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.rpc("get_transaction_history");
      if (!error && data) {
        setTransactions(data as Transaction[]);
      }
      setLoadingTx(false);
    }
    load();
  }, []);

  function copyId() {
    if (!profile) return;
    navigator.clipboard.writeText(profile.zos_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!profile) return null;

  const recentTx = transactions.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Balance card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-700 p-6 md:p-8 shadow-xl shadow-teal-500/10">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <div className="flex items-center gap-2 text-teal-50/80 text-sm mb-1">
            <Wallet className="w-4 h-4" />
            Total Balance
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl md:text-5xl font-bold text-white tracking-tight">
              {formatZOS(profile.balance)}
            </span>
            <span className="text-xl text-teal-100/80 font-medium">ZOS</span>
          </div>
          <p className="text-teal-100/60 text-sm mt-1">≈ {formatZOS(profile.balance)} ₮ MNT</p>

          <div className="mt-6 flex items-center gap-2">
            <div className="flex-1 bg-white/15 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/10">
              <p className="text-xs text-teal-50/60">Your ZOS ID</p>
              <p className="text-lg font-mono font-semibold text-white tracking-wider">
                {profile.zos_id}
              </p>
            </div>
            <button
              onClick={copyId}
              className="bg-white/15 hover:bg-white/25 backdrop-blur-sm rounded-xl p-3 border border-white/10 transition-all"
              title="Copy ZOS ID"
            >
              {copied ? (
                <Check className="w-5 h-5 text-white" />
              ) : (
                <Copy className="w-5 h-5 text-white" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <QuickAction icon={Send} label="Send" onClick={() => onNavigate("send")} />
        <QuickAction icon={ArrowDownToLine} label="Deposit" onClick={() => onNavigate("deposit")} />
        <QuickAction icon={Receipt} label="History" onClick={() => onNavigate("history")} />
      </div>

      {/* Recent activity */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
          <button
            onClick={() => onNavigate("history")}
            className="text-sm text-teal-400 hover:text-teal-300 font-medium"
          >
            View all
          </button>
        </div>

        {loadingTx ? (
          <div className="text-center py-8 text-slate-500 text-sm">Loading...</div>
        ) : recentTx.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-slate-500 text-sm mb-3">No transactions yet</p>
            <button
              onClick={() => onNavigate("deposit")}
              className="text-sm text-teal-400 hover:text-teal-300 font-medium"
            >
              Make your first deposit
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {recentTx.map((tx) => (
              <TxRow key={tx.id} tx={tx} currentUserId={profile.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Send;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-teal-500/30 rounded-2xl py-4 md:py-5 transition-all group"
    >
      <div className="w-10 h-10 rounded-xl bg-teal-500/10 group-hover:bg-teal-500/20 flex items-center justify-center transition-all">
        <Icon className="w-5 h-5 text-teal-400" />
      </div>
      <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-all">
        {label}
      </span>
    </button>
  );
}

export function TxRow({ tx, currentUserId }: { tx: Transaction; currentUserId: string }) {
  const isIncoming = tx.receiver_id === currentUserId;
  const isDeposit = tx.type === "deposit";
  const isExternal = tx.type === "adjustment";
  const otherUsername = isIncoming ? tx.sender_username : tx.receiver_username;
  const otherZosId = isIncoming ? tx.sender_zos_id : tx.receiver_zos_id;
  const counterparty = isExternal ? "Zethbet" : otherUsername;
  const subtitle = isDeposit ? null : isExternal ? tx.note : otherZosId;

  return (
    <div className="flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-slate-800/40 transition-all">
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isIncoming ? "bg-emerald-500/10" : "bg-slate-700/40"
        }`}
      >
        {isDeposit ? (
          <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
        ) : isIncoming ? (
          <ArrowDownLeft className="w-5 h-5 text-emerald-400" />
        ) : (
          <ArrowUpRight className="w-5 h-5 text-slate-400" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white">
          {isDeposit
            ? "Deposit via Qpay"
            : isIncoming
              ? `From ${counterparty}`
              : `To ${counterparty}`}
        </p>
        <p className="text-xs text-slate-500">
          {subtitle ? `${subtitle} · ` : ""}
          {formatDate(tx.created_at)}
        </p>
      </div>

      <div className="text-right flex-shrink-0">
        <p
          className={`text-sm font-semibold ${
            isIncoming ? "text-emerald-400" : "text-slate-300"
          }`}
        >
          {isIncoming ? "+" : "−"}
          {formatZOS(tx.amount)} ZOS
        </p>
      </div>
    </div>
  );
}

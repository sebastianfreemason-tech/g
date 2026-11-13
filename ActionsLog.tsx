import { ArrowDownToLine, ArrowUpFromLine, Ban, Banknote, Loader2, ShieldCheck, XCircle } from "lucide-react";
import type { AdminAction, AdminActionType } from "@/lib/types";
import { formatZOS } from "@/lib/format";

const ACTION_LABELS: Record<AdminActionType, string> = {
  add_balance: "Added balance",
  remove_balance: "Removed balance",
  ban: "Suspended account",
  unban: "Restored account",
  withdrawal_completed: "Bank withdrawal sent",
  withdrawal_rejected: "Bank withdrawal rejected",
};

const ACTION_ICONS: Record<AdminActionType, typeof Ban> = {
  add_balance: ArrowDownToLine,
  remove_balance: ArrowUpFromLine,
  ban: Ban,
  unban: ShieldCheck,
  withdrawal_completed: Banknote,
  withdrawal_rejected: XCircle,
};

interface ActionsLogProps {
  actions: AdminAction[];
  error: string | null;
  loading: boolean;
}

export default function ActionsLog({ actions, error, loading }: ActionsLogProps) {
  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-300 py-4 text-center">{error}</p>;
  }

  if (actions.length === 0) {
    return <p className="text-sm text-slate-500 py-4 text-center">No admin actions yet</p>;
  }

  return (
    <ul className="divide-y divide-slate-800">
      {actions.map((item, index) => {
        const Icon = ACTION_ICONS[item.action];
        const amountText = item.amount !== null ? ` ${formatZOS(item.amount)} ₮` : "";
        return (
          <li key={`${item.created_at}-${index}`} className="flex items-start gap-3 py-3">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
              <Icon className="w-4 h-4 text-slate-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white">
                <span className="font-medium">{ACTION_LABELS[item.action]}</span>
                {amountText && <span className="tabular-nums">{amountText}</span>}
                <span className="text-slate-400"> for {item.target_username}</span>
                <span className="text-slate-500 font-mono text-xs"> ({item.target_zos_id})</span>
              </p>
              {item.note && <p className="text-xs text-slate-400 mt-0.5 truncate">{item.note}</p>}
              <p className="text-xs text-slate-500 mt-0.5">
                by {item.admin_username} · {new Date(item.created_at).toLocaleString()}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

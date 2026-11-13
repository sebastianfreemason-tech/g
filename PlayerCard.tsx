import { useState } from "react";
import { Ban, CheckCircle2, Loader2, Minus, Plus, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatZOS } from "@/lib/format";
import type { AdminPlayer } from "@/lib/types";
import { ADMIN_GENERIC_ERROR, readRpcError } from "@/admin/adminRpc";
import BalanceModal, { type BalanceMode } from "@/admin/BalanceModal";

interface PlayerCardProps {
  player: AdminPlayer;
  onChanged: () => Promise<void>;
}

export default function PlayerCard({ player, onChanged }: PlayerCardProps) {
  const [balanceMode, setBalanceMode] = useState<BalanceMode | null>(null);
  const [confirmingBan, setConfirmingBan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function applyBalance(mode: BalanceMode, amount: number, note: string | null): Promise<string | null> {
    const { data, error } = await supabase.rpc("admin_adjust_balance", {
      p_zos_id: player.zos_id,
      p_amount: amount,
      p_mode: mode,
      p_note: note,
    });
    if (error) return ADMIN_GENERIC_ERROR;
    const serverError = readRpcError(data);
    if (serverError) return serverError;

    setNotice({
      tone: "success",
      text: mode === "add" ? `Added ${formatZOS(amount)} ₮ to ${player.username}` : `Removed ${formatZOS(amount)} ₮ from ${player.username}`,
    });
    await onChanged();
    return null;
  }

  async function toggleBan() {
    setBusy(true);
    setNotice(null);
    const { data, error } = await supabase.rpc("admin_set_banned", {
      p_zos_id: player.zos_id,
      p_banned: !player.is_banned,
    });
    setBusy(false);
    setConfirmingBan(false);
    const serverError = error ? ADMIN_GENERIC_ERROR : readRpcError(data);
    if (serverError) {
      setNotice({ tone: "error", text: serverError });
      return;
    }
    setNotice({
      tone: "success",
      text: player.is_banned ? `${player.username} can use their account again` : `${player.username} has been suspended`,
    });
    await onChanged();
  }

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Player</p>
          <h2 className="text-xl font-semibold text-white">{player.username}</h2>
          <p className="text-sm font-mono text-teal-400 mt-1">ZOS ID {player.zos_id}</p>
        </div>
        <div className="md:text-right">
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Balance</p>
          <p className="text-2xl font-semibold text-white tabular-nums">{formatZOS(player.balance)} ₮</p>
          <span
            className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-xs font-medium border ${
              player.is_banned
                ? "bg-red-500/10 text-red-300 border-red-500/20"
                : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${player.is_banned ? "bg-red-400" : "bg-emerald-400"}`} />
            {player.is_banned ? "Suspended" : "Active"}
          </span>
        </div>
      </div>

      {notice && (
        <div
          className={`flex items-center gap-3 rounded-xl px-4 py-3 border ${
            notice.tone === "success"
              ? "bg-emerald-500/10 border-emerald-500/20"
              : "bg-red-500/10 border-red-500/20"
          }`}
        >
          {notice.tone === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-red-400 flex-shrink-0" />
          )}
          <p className={`text-sm ${notice.tone === "success" ? "text-emerald-300" : "text-red-300"}`}>{notice.text}</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={() => setBalanceMode("add")}
          className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-white bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 rounded-xl transition-all"
        >
          <Plus className="w-4 h-4" />
          Add balance
        </button>
        <button
          onClick={() => setBalanceMode("remove")}
          className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all"
        >
          <Minus className="w-4 h-4" />
          Remove balance
        </button>
        {player.is_banned ? (
          <button
            onClick={toggleBan}
            disabled={busy}
            className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Restore access
          </button>
        ) : confirmingBan ? (
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmingBan(false)}
              disabled={busy}
              className="flex-1 py-3 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={toggleBan}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-xl transition-all disabled:opacity-40"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm ban"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingBan(true)}
            className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-red-300 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-xl transition-all"
          >
            <Ban className="w-4 h-4" />
            Ban player
          </button>
        )}
      </div>

      {balanceMode && (
        <BalanceModal
          mode={balanceMode}
          username={player.username}
          onSubmit={(amount, note) => applyBalance(balanceMode, amount, note)}
          onClose={() => setBalanceMode(null)}
        />
      )}
    </section>
  );
}

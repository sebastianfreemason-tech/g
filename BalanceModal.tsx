import { useState } from "react";
import { AlertCircle, Loader2, Minus, Plus, X } from "lucide-react";

export type BalanceMode = "add" | "remove";

const MAX_AMOUNT = 1_000_000_000;

interface BalanceModalProps {
  mode: BalanceMode;
  username: string;
  onSubmit: (amount: number, note: string | null) => Promise<string | null>;
  onClose: () => void;
}

export default function BalanceModal({ mode, username, onSubmit, onClose }: BalanceModalProps) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdd = mode === "add";
  const title = isAdd ? "Add balance" : "Remove balance";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) {
      setError("Enter an amount between 0.01 and 1,000,000,000");
      return;
    }
    if (Math.round(value * 100) !== value * 100) {
      setError("Use at most two decimal places");
      return;
    }
    const trimmedNote = note.trim();
    setBusy(true);
    setError(null);
    const err = await onSubmit(value, trimmedNote === "" ? null : trimmedNote);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <p className="text-sm text-slate-400 mt-1">For {username}</p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-slate-500 hover:text-white p-1 rounded-lg transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Amount (₮)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              autoFocus
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white text-lg placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Reason <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Visible in the player's history"
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
            />
          </div>

          {error && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 py-3 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !amount}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-white rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                isAdd
                  ? "bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500"
                  : "bg-red-600 hover:bg-red-500"
              }`}
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isAdd ? (
                <>
                  <Plus className="w-4 h-4" />
                  Add
                </>
              ) : (
                <>
                  <Minus className="w-4 h-4" />
                  Remove
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

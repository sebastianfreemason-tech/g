import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatZOS } from "@/lib/format";
import { Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const TRANSFER_FEE_ZOS = 50;

export default function SendView() {
  const { profile, refreshProfile } = useAuth();
  const [zosId, setZosId] = useState("");
  const [amount, setAmount] = useState("");
  const [lookupResult, setLookupResult] = useState<{ found: boolean; username?: string } | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleLookup(id: string) {
    setZosId(id);
    setLookupResult(null);
    setError(null);
    const clean = id.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setLookingUp(true);
    const { data, error } = await supabase.rpc("lookup_user_by_zos_id", {
      p_zos_id: clean,
    });
    setLookingUp(false);
    if (!error && data) {
      setLookupResult(data as { found: boolean; username?: string });
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cleanId = zosId.replace(/\D/g, "");
    const amt = parseFloat(amount);

    if (cleanId.length !== 8) {
      setError("Enter a valid 8-digit ZOS ID");
      return;
    }
    if (!amt || amt <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (profile && amt + TRANSFER_FEE_ZOS > profile.balance) {
      setError("Insufficient balance. A 50 ZOS transfer fee applies to every transfer.");
      return;
    }

    setSending(true);
    const { data, error } = await supabase.rpc("send_zos", {
      p_receiver_zos_id: cleanId,
      p_amount: amt,
      p_note: null,
    });
    setSending(false);

    if (error) {
      setError("Failed to send. Please try again.");
      return;
    }

    const result = data as { error?: string; success?: boolean };
    if (result?.error) {
      setError(result.error);
      return;
    }

    if (result?.success) {
      setSuccess(`Successfully sent ${formatZOS(amt)} ZOS to ${lookupResult?.username}`);
      setZosId("");
      setAmount("");
      setLookupResult(null);
      await refreshProfile();
      setTimeout(() => setSuccess(null), 5000);
    }
  }

  if (!profile) return null;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Send ZOS</h1>
        <p className="text-slate-400 text-sm mt-1">Transfer to another user by their 8-digit ZOS ID</p>
      </div>

      {/* Balance reminder */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 px-5 py-4 flex items-center justify-between">
        <span className="text-sm text-slate-400">Available balance</span>
        <span className="text-lg font-semibold text-teal-400">{formatZOS(profile.balance)} ZOS</span>
      </div>

      {/* Success banner */}
      {success && (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <p className="text-sm text-emerald-300">{success}</p>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSend} className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-5">
        {/* Recipient */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Recipient ZOS ID
          </label>
          <div className="relative">
            <input
              type="text"
              value={zosId}
              onChange={(e) => handleLookup(e.target.value)}
              placeholder="00000000"
              maxLength={8}
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white text-lg font-mono tracking-widest placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all pr-10"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {lookingUp ? (
                <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
              ) : lookupResult?.found ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : null}
            </div>
          </div>
          {lookupResult?.found && (
            <div className="mt-2 flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              Sending to <span className="font-medium">{lookupResult.username}</span>
            </div>
          )}
          {lookupResult && !lookupResult.found && zosId.replace(/\D/g, "").length === 8 && (
            <p className="mt-2 text-sm text-red-400">No user found with that ZOS ID</p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Amount (ZOS)
          </label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white text-lg placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium">
              ZOS
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">1 ZOS = 1 ₮ (MNT)</p>
        </div>


        <button
          type="submit"
          disabled={sending || !lookupResult?.found || !amount}
          className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-medium rounded-xl hover:from-teal-400 hover:to-emerald-500 transition-all shadow-lg shadow-teal-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {sending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4" />
              Send {amount ? `${formatZOS(parseFloat(amount) || 0)} ZOS` : "ZOS"}
            </>
          )}
        </button>
      </form>

    </div>
  );
}

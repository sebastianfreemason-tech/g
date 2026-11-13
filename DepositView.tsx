import { useCallback, useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatZOS } from "@/lib/format";
import type { Deposit } from "@/lib/types";
import DepositQrPanel, { type PendingPayment } from "@/components/DepositQrPanel";
import { ArrowDownToLine, Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react";

const MAX_DAILY = 100000;

interface CreateDepositResponse {
  deposit_id?: string;
  invoice_id?: string;
  qr_text?: string | null;
  qr_image?: string | null;
}

async function readFunctionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    if (body && typeof body.error === "string") return body.error;
  }
  return "Failed to start payment. Please try again.";
}

export default function DepositView() {
  const { profile, refreshProfile } = useAuth();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payment, setPayment] = useState<PendingPayment | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [todayTotal, setTodayTotal] = useState(0);
  const [recentDeposits, setRecentDeposits] = useState<Deposit[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadDepositData = useCallback(async () => {
    await supabase.rpc("expire_stale_pending_deposits");
    const { data: total } = await supabase.rpc("get_today_deposit_total");
    if (typeof total === "number") setTodayTotal(total);

    const { data: deposits } = await supabase
      .from("deposits")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);
    if (deposits) setRecentDeposits(deposits as Deposit[]);
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    loadDepositData();
  }, [loadDepositData]);

  async function handleCreateDeposit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (amt > MAX_DAILY) {
      setError("Maximum single deposit is 100,000 ₮");
      return;
    }
    if (todayTotal + amt > MAX_DAILY) {
      setError(`Daily limit exceeded. You've already deposited ${formatZOS(todayTotal)} ₮ today. Remaining: ${formatZOS(MAX_DAILY - todayTotal)} ₮`);
      return;
    }

    setBusy(true);
    const { data, error: invokeError } = await supabase.functions.invoke<CreateDepositResponse>(
      "qpay-create-deposit",
      { body: { amount: amt } },
    );
    setBusy(false);

    if (invokeError) {
      setError(await readFunctionError(invokeError));
      return;
    }
    if (!data?.deposit_id || (!data.qr_text && !data.qr_image)) {
      setError("Failed to start payment. Please try again.");
      return;
    }

    setPayment({
      depositId: data.deposit_id,
      amount: amt,
      qrText: data.qr_text ?? null,
      qrImage: data.qr_image ?? null,
    });
    setAmount("");
    await loadDepositData();
  }

  const handleConfirmed = useCallback(async () => {
    if (payment) setSuccess(`Deposit of ${formatZOS(payment.amount)} ZOS confirmed!`);
    setPayment(null);
    await refreshProfile();
    await loadDepositData();
  }, [payment, refreshProfile, loadDepositData]);

  function handleClosePayment() {
    setPayment(null);
    void loadDepositData();
  }

  useEffect(() => {
    if (!success) return;
    const id = window.setTimeout(() => setSuccess(null), 5000);
    return () => window.clearTimeout(id);
  }, [success]);

  if (!profile) return null;

  const remaining = MAX_DAILY - todayTotal;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Deposit ZOS</h1>
        <p className="text-slate-400 text-sm mt-1">Add ZOS via Qpay · 1 ZOS = 1 ₮</p>
      </div>

      {/* Daily limit bar */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-400">Today's deposit total</span>
          <span className="text-sm font-semibold text-white">
            {formatZOS(todayTotal)} / {formatZOS(MAX_DAILY)} ₮
          </span>
        </div>
        <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full transition-all"
            style={{ width: `${Math.min((todayTotal / MAX_DAILY) * 100, 100)}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Remaining today: {formatZOS(remaining)} ₮ · Max 100,000 ₮ per day
        </p>
      </div>

      {success && (
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <p className="text-sm text-emerald-300">{success}</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}

      {payment ? (
        <DepositQrPanel payment={payment} onConfirmed={handleConfirmed} onCancel={handleClosePayment} />
      ) : (
        <form onSubmit={handleCreateDeposit} className="bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Deposit Amount (₮)
            </label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={remaining}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white text-lg placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm font-medium">
                ₮
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              You'll receive {amount && parseFloat(amount) > 0 ? formatZOS(parseFloat(amount)) : "0.00"} ZOS
            </p>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[1000, 5000, 10000, 50000].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmount(String(amt))}
                disabled={amt > remaining}
                className="py-2 text-sm font-medium text-slate-300 bg-slate-800/50 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {amt >= 1000 ? `${amt / 1000}k` : amt}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={busy || !amount}
            className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-medium rounded-xl hover:from-teal-400 hover:to-emerald-500 transition-all shadow-lg shadow-teal-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {busy ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <ArrowDownToLine className="w-4 h-4" />
                Deposit via Qpay
              </>
            )}
          </button>
        </form>
      )}

      {/* Recent deposits */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-5">
        <h2 className="text-sm font-semibold text-white mb-3">Recent Deposits</h2>
        {loadingHistory ? (
          <p className="text-sm text-slate-500 py-4 text-center">Loading...</p>
        ) : recentDeposits.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No deposits yet</p>
        ) : (
          <div className="space-y-1">
            {recentDeposits.map((dep) => (
              <div key={dep.id} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-slate-800/40">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    dep.status === "confirmed" ? "bg-emerald-500/10" : dep.status === "failed" ? "bg-red-500/10" : "bg-amber-500/10"
                  }`}>
                    {dep.status === "confirmed" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : dep.status === "failed" ? (
                      <AlertCircle className="w-4 h-4 text-red-400" />
                    ) : (
                      <Clock className="w-4 h-4 text-amber-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-white font-medium">{formatZOS(dep.amount)} ZOS</p>
                    <p className="text-xs text-slate-500 capitalize">{dep.status}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { formatZOS } from "@/lib/format";
import { AlertCircle, Loader2, CheckCircle2 } from "lucide-react";

const POLL_INTERVAL_MS = 10000;

export interface PendingPayment {
  depositId: string;
  amount: number;
  qrText: string | null;
  qrImage: string | null;
}

export default function DepositQrPanel({
  payment,
  onConfirmed,
  onCancel,
}: {
  payment: PendingPayment;
  onConfirmed: () => void;
  onCancel: () => void;
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (payment.qrImage) {
      setQrUrl(payment.qrImage.startsWith("data:") ? payment.qrImage : `data:image/png;base64,${payment.qrImage}`);
      return;
    }
    if (!payment.qrText) return;
    let cancelled = false;
    QRCode.toDataURL(payment.qrText, { width: 240, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [payment.qrImage, payment.qrText]);

  const checkStatus = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke<{ status?: string; error?: string }>(
      "qpay-verify-deposit",
      { body: { deposit_id: payment.depositId } },
    );
    if (error || !data?.status) {
      setStatusError("Could not check payment status. Trying again...");
      return;
    }
    setStatusError(null);
    if (data.status === "confirmed") onConfirmed();
    if (data.status === "failed") setFailed(true);
  }, [payment.depositId, onConfirmed]);

  useEffect(() => {
    if (failed) return;
    const id = window.setInterval(() => {
      void checkStatus();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [failed, checkStatus]);

  async function handleCheckNow() {
    setChecking(true);
    await checkStatus();
    setChecking(false);
  }

  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 text-center space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Scan to pay</h2>
        <p className="text-sm text-slate-400 mt-1">
          Pay {formatZOS(payment.amount)} ₮ with any Qpay-supported bank app
        </p>
      </div>

      <div className="bg-white rounded-xl p-4 mx-auto w-fit">
        {qrUrl ? (
          <img src={qrUrl} alt="Qpay payment QR code" className="w-56 h-56" />
        ) : (
          <div className="w-56 h-56 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
          </div>
        )}
      </div>

      {failed ? (
        <div className="flex items-center justify-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" />
          This payment could not be completed. Please start a new deposit.
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Waiting for payment. This updates automatically once Qpay confirms it.
        </p>
      )}
      {statusError && <p className="text-xs text-amber-400">{statusError}</p>}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-3 bg-slate-800 text-slate-300 font-medium rounded-xl hover:bg-slate-700 transition-all"
        >
          {failed ? "Close" : "Cancel"}
        </button>
        {!failed && (
          <button
            onClick={handleCheckNow}
            disabled={checking}
            className="flex-1 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-medium rounded-xl hover:from-teal-400 hover:to-emerald-500 transition-all shadow-lg shadow-teal-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {checking ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                I've Paid
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

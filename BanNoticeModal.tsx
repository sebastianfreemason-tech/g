import { ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function BanNoticeModal() {
  const { bannedNotice, dismissBanNotice } = useAuth();
  if (!bannedNotice) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="ban-notice-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn"
    >
      <div className="w-full max-w-md bg-slate-900 border border-red-500/30 rounded-2xl p-6 md:p-8 shadow-2xl text-center animate-scaleIn">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 mb-5">
          <ShieldAlert className="w-7 h-7 text-red-400" />
        </div>
        <h2 id="ban-notice-title" className="text-xl font-semibold text-white">
          Your account has been banned
        </h2>
        <p className="text-sm text-slate-400 mt-3 leading-relaxed">
          You have been signed out and can no longer sign in or use ZOS. If you believe this is a mistake, contact the ZOS team.
        </p>
        <button
          type="button"
          onClick={dismissBanNotice}
          className="mt-6 w-full py-3 bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-xl transition-all"
        >
          OK
        </button>
      </div>
    </div>
  );
}

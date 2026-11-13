import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import AdminLogin from "@/admin/AdminLogin";
import AdminConsole from "@/admin/AdminConsole";
import { ADMIN_GENERIC_ERROR } from "@/admin/adminRpc";

type AdminCheck = { userId: string; status: "allowed" | "denied" | "error" };

export default function AdminPage() {
  const { session, loading, signOut } = useAuth();
  const userId = session?.user.id ?? null;
  const [check, setCheck] = useState<AdminCheck | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("is_admin");
      if (cancelled) return;
      const status: AdminCheck["status"] = error ? "error" : data === true ? "allowed" : "denied";
      setCheck({ userId, status });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <FullScreenSpinner />;
  if (!session || !userId) return <AdminLogin />;
  if (!check || check.userId !== userId) return <FullScreenSpinner />;

  if (check.status === "allowed") return <AdminConsole />;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
        <div className="mx-auto w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
          <ShieldCheck className="w-6 h-6 text-red-400" />
        </div>
        <h1 className="text-lg font-semibold text-white">
          {check.status === "denied" ? "Access denied" : "Could not verify access"}
        </h1>
        <p className="text-sm text-slate-400 mt-2">
          {check.status === "denied"
            ? "This account does not have admin access."
            : ADMIN_GENERIC_ERROR}
        </p>
        <button
          onClick={() => signOut()}
          className="mt-6 w-full py-2.5 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function FullScreenSpinner() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
    </div>
  );
}

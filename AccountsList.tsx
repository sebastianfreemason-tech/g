import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatZOS } from "@/lib/format";
import type { AdminAccount } from "@/lib/types";
import { ADMIN_GENERIC_ERROR, parseAccounts } from "@/admin/adminRpc";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-800 rounded-md transition-all"
      aria-label="Copy account ID"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function AccountsList() {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const loadAccounts = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("admin_list_accounts");
    setLoading(false);
    if (rpcError) {
      setError(ADMIN_GENERIC_ERROR);
      return;
    }
    setError(null);
    setAccounts(parseAccounts(data));
  }, []);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        a.username.toLowerCase().includes(q) ||
        a.zos_id.includes(q) ||
        a.id.toLowerCase().includes(q),
    );
  }, [accounts, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {loading ? "Loading accounts..." : `${accounts.length} account${accounts.length === 1 ? "" : "s"}`}
        </p>
        <div className="relative w-full max-w-xs">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, ZOS ID or account ID"
            className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-300 py-4 text-center">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-500 py-4 text-center">No accounts match your search</p>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-800">
                <th className="px-2 py-2 font-medium">Username</th>
                <th className="px-2 py-2 font-medium">ZOS ID</th>
                <th className="px-2 py-2 font-medium">Account ID</th>
                <th className="px-2 py-2 font-medium text-right">Balance</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map((account) => (
                <tr key={account.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-2 py-3 text-white font-medium">{account.username}</td>
                  <td className="px-2 py-3 text-teal-400 font-mono">{account.zos_id}</td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 font-mono text-xs break-all">{account.id}</span>
                      <CopyButton value={account.id} />
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right text-white tabular-nums">{formatZOS(account.balance)} ₮</td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {account.is_admin && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/20">Admin</span>
                      )}
                      {account.is_banned ? (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/10 text-red-300 border border-red-500/20">Suspended</span>
                      ) : (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">Active</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {new Date(account.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

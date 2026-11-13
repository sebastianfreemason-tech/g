import { useCallback, useEffect, useState } from "react";
import { AlertCircle, LogOut, Search, ShieldCheck, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { AdminAction, AdminPlayer } from "@/lib/types";
import { ADMIN_GENERIC_ERROR, parseActions, parsePlayer, readRpcError } from "@/admin/adminRpc";
import PlayerCard from "@/admin/PlayerCard";
import ActionsLog from "@/admin/ActionsLog";
import AccountsList from "@/admin/AccountsList";

export default function AdminConsole() {
  const { profile, signOut } = useAuth();
  const [zosId, setZosId] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [player, setPlayer] = useState<AdminPlayer | null>(null);
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [actionsError, setActionsError] = useState<string | null>(null);
  const [loadingActions, setLoadingActions] = useState(true);

  const loadActions = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_recent_actions", { p_limit: 20 });
    setLoadingActions(false);
    if (error) {
      setActionsError(ADMIN_GENERIC_ERROR);
      return;
    }
    setActionsError(null);
    setActions(parseActions(data));
  }, []);

  useEffect(() => {
    void loadActions();
  }, [loadActions]);

  async function lookupPlayer(id: string): Promise<string | null> {
    const { data, error } = await supabase.rpc("admin_find_user", { p_zos_id: id });
    if (error) return ADMIN_GENERIC_ERROR;
    const found = parsePlayer(data);
    if (!found) return readRpcError(data) ?? ADMIN_GENERIC_ERROR;
    setPlayer(found);
    return null;
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = zosId.trim();
    setSearchError(null);
    if (!/^\d{8}$/.test(cleaned)) {
      setPlayer(null);
      setSearchError("Enter an 8-digit ZOS ID");
      return;
    }
    setSearching(true);
    const err = await lookupPlayer(cleaned);
    setSearching(false);
    if (err) {
      setPlayer(null);
      setSearchError(err);
    }
  }

  async function handlePlayerChanged() {
    if (!player) return;
    const err = await lookupPlayer(player.zos_id);
    if (err) setSearchError(err);
    await loadActions();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="bg-slate-900 border-b border-slate-800">
        <div className="max-w-4xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white leading-tight">Admin console</p>
              <p className="text-xs text-slate-500 leading-tight">Signed in as {profile?.username}</p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-6">
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6">
          <h2 className="text-sm font-semibold text-white mb-1">Find a player</h2>
          <p className="text-xs text-slate-500 mb-4">Enter the 8-digit ZOS ID of the player.</p>
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={zosId}
                onChange={(e) => setZosId(e.target.value.replace(/\D/g, ""))}
                placeholder="00000000"
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white text-lg font-mono tracking-widest placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={searching || zosId.length !== 8}
              className="px-5 py-3 bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-medium rounded-xl hover:from-teal-400 hover:to-emerald-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-4 h-4" />}
              Find
            </button>
          </form>
          {searchError && (
            <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mt-4">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">{searchError}</p>
            </div>
          )}
        </section>

        {player && <PlayerCard player={player} onChanged={handlePlayerChanged} />}

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6">
          <h2 className="text-sm font-semibold text-white mb-1">All accounts</h2>
          <p className="text-xs text-slate-500 mb-4">Every account that has been created, with its account ID.</p>
          <AccountsList />
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 md:p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Recent admin actions</h2>
          <ActionsLog actions={actions} error={actionsError} loading={loadingActions} />
        </section>
      </main>
    </div>
  );
}

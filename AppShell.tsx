import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Wallet, LayoutDashboard, Send, ArrowDownToLine, Receipt, LogOut, Menu } from "lucide-react";
import type { PageId } from "@/App";

interface NavItem {
  id: PageId;
  label: string;
  icon: typeof LayoutDashboard;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "send", label: "Send", icon: Send },
  { id: "deposit", label: "Deposit", icon: ArrowDownToLine },
  { id: "history", label: "History", icon: Receipt },
];

export default function AppShell({
  children,
  current,
  onNavigate,
}: {
  children: React.ReactNode;
  current: PageId;
  onNavigate: (id: PageId) => void;
}) {
  const { profile, signOut, isAdmin } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-slate-950 flex">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex w-64 flex-col bg-slate-900 border-r border-slate-800 fixed inset-y-0 left-0 z-30">
        <SidebarContent items={visibleItems} current={current} onNavigate={onNavigate} profile={profile} onSignOut={signOut} />
      </aside>

      {/* Sidebar — mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
            <SidebarContent
              items={visibleItems}
              current={current}
              onNavigate={(id) => { onNavigate(id); setMobileOpen(false); }}
              profile={profile}
              onSignOut={signOut}
            />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 md:ml-64 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 h-16 bg-slate-900 border-b border-slate-800 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-white font-bold text-lg">ZOS</span>
          </div>
          <button
            onClick={() => setMobileOpen(true)}
            className="text-slate-400 hover:text-white p-2"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>

        <main className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  items,
  current,
  onNavigate,
  profile,
  onSignOut,
}: {
  items: NavItem[];
  current: PageId;
  onNavigate: (id: PageId) => void;
  profile: { username: string; zos_id: string } | null;
  onSignOut: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-800">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-teal-500/20">
          <Wallet className="w-5 h-5 text-white" strokeWidth={2.5} />
        </div>
        <span className="text-white font-bold text-xl tracking-tight">ZOS</span>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = current === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                active
                  ? "bg-teal-500/10 text-teal-400 border border-teal-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50"
              }`}
            >
              <Icon className="w-5 h-5" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User card */}
      <div className="p-4 border-t border-slate-800">
        <div className="bg-slate-800/50 rounded-xl p-3 mb-3">
          <p className="text-xs text-slate-500">Signed in as</p>
          <p className="text-sm font-medium text-white truncate">{profile?.username}</p>
          <p className="text-xs text-teal-400 font-mono mt-1">ZOS ID: {profile?.zos_id}</p>
        </div>
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
        >
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </>
  );
}

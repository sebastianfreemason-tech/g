import { useState } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";
import LandingPage from "@/components/LandingPage";
import AuthPage from "@/components/AuthPage";
import AppShell from "@/components/AppShell";
import Dashboard from "@/views/Dashboard";
import SendView from "@/views/SendView";
import DepositView from "@/views/DepositView";
import HistoryView from "@/views/HistoryView";
import AdminPage from "@/admin/AdminPage";
import BanNoticeModal from "@/components/BanNoticeModal";
import { Loader2 } from "lucide-react";

const ADMIN_PATH = "/supernaturalsecret";

export type PageId = "dashboard" | "send" | "deposit" | "history";

type AuthView = { screen: "landing" } | { screen: "auth"; mode: "login" | "register" };

function AppContent() {
  const { session, profile, loading, isAdmin, refreshProfile } = useAuth();
  const [page, setPage] = useState<PageId>("dashboard");
  const [authView, setAuthView] = useState<AuthView>({ screen: "landing" });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (!session) {
    if (authView.screen === "landing") {
      return (
        <LandingPage
          onGetStarted={(mode) => setAuthView({ screen: "auth", mode })}
        />
      );
    }
    return (
      <AuthPage
        initialMode={authView.mode}
        onBack={() => setAuthView({ screen: "landing" })}
      />
    );
  }

  if (session && !profile) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
        <p className="text-sm text-slate-400">Loading your account...</p>
        <button
          onClick={() => refreshProfile()}
          className="text-sm font-medium text-teal-400 hover:text-teal-300 transition-colors"
        >
          Not loading? Retry
        </button>
      </div>
    );
  }

  return (
    <AppShell current={page} onNavigate={setPage}>
      {page === "dashboard" && <Dashboard onNavigate={setPage} />}
      {page === "send" && <SendView />}
      {page === "deposit" && <DepositView />}
      {page === "history" && <HistoryView />}
    </AppShell>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
      <BanNoticeModal />
    </AuthProvider>
  );
}

function Root() {
  if (window.location.pathname.replace(/\/+$/, "") === ADMIN_PATH) {
    return <AdminPage />;
  }
  return <AppContent />;
}

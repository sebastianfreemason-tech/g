import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  bannedNotice: boolean;
  dismissBanNotice: () => void;
  signUp: (username: string, password: string) => Promise<{ error: string | null }>;
  signIn: (username: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [bannedNotice, setBannedNotice] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadProfile = useCallback(async (uid: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();
    if (error) {
      console.error("Failed to load profile:", error.message);
      return;
    }
    const loaded = data as Profile | null;
    if (loaded?.is_banned) {
      setBannedNotice(true);
      await supabase.auth.signOut({ scope: "local" });
      setSession(null);
      setProfile(null);
      return;
    }
    setProfile(loaded);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) {
        loadProfile(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        setSession(newSession);
        if (newSession) {
          await loadProfile(newSession.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      })();
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`profile-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        () => {
          void loadProfile(userId);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, loadProfile]);

  useEffect(() => {
    if (!userId) {
      setIsAdmin(false);
      return;
    }
    supabase.rpc("is_admin").then(({ data, error }) => {
      setIsAdmin(!error && data === true);
    });
  }, [userId]);

  const signUp = async (username: string, password: string) => {
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!cleanUsername) return { error: "Username can only contain letters, numbers, and underscores" };
    if (cleanUsername.length < 3) return { error: "Username must be at least 3 characters" };
    if (password.length < 6) return { error: "Password must be at least 6 characters" };

    const syntheticEmail = `${cleanUsername}@zos.app`;
    const { data, error } = await supabase.auth.signUp({
      email: syntheticEmail,
      password,
    });
    if (error) {
      if (error.message.includes("already registered")) {
        return { error: "That username is already taken" };
      }
      return { error: error.message };
    }
    if (data.session) {
      setSession(data.session);
      await loadProfile(data.session.user.id);
    }
    return { error: null };
  };

  const signIn = async (username: string, password: string) => {
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    const syntheticEmail = `${cleanUsername}@zos.app`;
    const { data, error } = await supabase.auth.signInWithPassword({
      email: syntheticEmail,
      password,
    });
    if (error) {
      return { error: "Invalid username or password" };
    }
    if (data.session) {
      setSession(data.session);
      await loadProfile(data.session.user.id);
    }
    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut({ scope: "local" });
    setSession(null);
    setProfile(null);
  };

  const refreshProfile = async () => {
    if (session) await loadProfile(session.user.id);
  };

  const dismissBanNotice = () => setBannedNotice(false);

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        isAdmin,
        bannedNotice,
        dismissBanNotice,
        signUp,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

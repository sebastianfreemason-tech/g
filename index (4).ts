import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VerifyKeyRequest {
  api_key?: string;
  key?: string;
}

interface LoginRequest {
  username?: string;
  password?: string;
  app_name?: string;
}

interface RegisterRequest {
  username?: string;
  password?: string;
  app_name?: string;
}

interface ApiKeyResult {
  success?: boolean;
  error?: string;
  api_key?: string;
  key_id?: string;
  label?: string;
}

async function issueApiKey(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  appName: unknown,
): Promise<string | null> {
  const label = appName ? String(appName).trim() : "External App";
  const { data, error } = await supabase.rpc("login_generate_api_key", {
    p_user_id: userId,
    p_label: label,
  });
  if (error) return null;
  return (data as ApiKeyResult | null)?.api_key ?? null;
}

interface VerifyKeyResult {
  valid?: boolean;
  error?: string;
  zos_id?: string;
  username?: string;
  balance?: number;
  label?: string;
}

interface ProfileRow {
  zos_id: string;
  username: string;
  balance: number;
}

interface BalanceAdjustRequest {
  api_key?: string;
  zos_id?: string;
  amount?: string | number;
  note?: string;
}

interface BalanceQueryRequest {
  api_key?: string;
  zos_id?: string;
}

interface AdjustResult {
  success?: boolean;
  error?: string;
  zos_id?: string;
  username?: string;
  balance?: number;
  label?: string;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const url = new URL(req.url);
    const route = url.pathname.replace(/\/$/, "").split("/").pop() ?? "";

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ============================================================
    // Route: /zos-auth/register — create a new ZOS account
    // ============================================================
    if (route === "register") {
      const { username, password, app_name } = body as RegisterRequest;

      if (!username || !password) {
        return jsonResponse({ success: false, error: "Missing username or password" }, 400);
      }

      const cleanUsername = String(username).trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      if (cleanUsername.length < 3) {
        return jsonResponse({ success: false, error: "Username must be at least 3 characters (letters, numbers, underscores)" }, 400);
      }
      if (String(password).length < 6) {
        return jsonResponse({ success: false, error: "Password must be at least 6 characters" }, 400);
      }

      const syntheticEmail = `${cleanUsername}@zos.app`;

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: syntheticEmail,
        password: String(password),
      });

      if (signUpError) {
        if (signUpError.message.includes("already registered")) {
          return jsonResponse({ success: false, error: "That username is already taken" }, 409);
        }
        return jsonResponse({ success: false, error: signUpError.message }, 400);
      }

      const userId = signUpData.user?.id;
      if (!userId) {
        return jsonResponse({ success: false, error: "Registration failed" }, 500);
      }

      // The database trigger creates the profile automatically. Fetch it.
      let profile: ProfileRow | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, error } = await supabase
          .from("profiles")
          .select("zos_id, username, balance")
          .eq("id", userId)
          .maybeSingle();
        if (!error && data) {
          profile = data as ProfileRow;
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }

      if (!profile) {
        return jsonResponse({ success: false, error: "Account created but profile not found. Try logging in." }, 201);
      }

      const apiKey = await issueApiKey(supabase, userId, app_name);
      if (!apiKey) {
        return jsonResponse({ success: false, error: "Account created but API key could not be issued. Try logging in." }, 500);
      }

      return jsonResponse({
        success: true,
        zos_id: profile.zos_id,
        username: profile.username,
        balance: Number(profile.balance),
        api_key: apiKey,
      }, 201);
    }

    // ============================================================
    // Route: /zos-auth/login — username + password authentication
    // ============================================================
    if (route === "login") {
      const { username, password, app_name } = body as LoginRequest;

      if (!username || !password) {
        return jsonResponse({ success: false, error: "Missing username or password" }, 400);
      }

      const cleanUsername = String(username).trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
      const syntheticEmail = `${cleanUsername}@zos.app`;

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: syntheticEmail,
        password: String(password),
      });

      if (authError || !authData.session) {
        return jsonResponse({ success: false, error: "Invalid username or password" }, 401);
      }

      const userId = authData.user.id;

      // Fetch the user's profile (zos_id + username + balance)
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("zos_id, username, balance")
        .eq("id", userId)
        .maybeSingle();

      if (profileError || !profile) {
        return jsonResponse({ success: false, error: "Profile not found" }, 404);
      }

      // Sign out immediately — we only needed to verify credentials
      await supabase.auth.signOut();

      const apiKey = await issueApiKey(supabase, userId, app_name);
      if (!apiKey) {
        return jsonResponse({ success: false, error: "Could not issue API key. Try again." }, 500);
      }

      const result = profile as ProfileRow;
      return jsonResponse({
        success: true,
        zos_id: result.zos_id,
        username: result.username,
        balance: Number(result.balance),
        api_key: apiKey,
      }, 200);
    }

    // ============================================================
    // Route: /zos-auth/balance — get current balance by API key + zos_id
    // ============================================================
    if (route === "balance") {
      const { api_key, zos_id } = body as BalanceQueryRequest;

      if (!api_key || !zos_id) {
        return jsonResponse({ success: false, error: "Missing api_key or zos_id" }, 400);
      }

      const { data, error } = await supabase.rpc("verify_api_key", {
        p_key: String(api_key),
      });

      const keyResult = data as VerifyKeyResult | null;
      if (error || !keyResult?.valid) {
        return jsonResponse({ success: false, error: "Invalid API key" }, 401);
      }
      if (keyResult.zos_id !== String(zos_id)) {
        return jsonResponse({ success: false, error: "API key does not belong to this user" }, 403);
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("zos_id, username, balance")
        .eq("zos_id", String(zos_id))
        .maybeSingle();

      if (profileError || !profile) {
        return jsonResponse({ success: false, error: "User not found" }, 404);
      }

      const row = profile as ProfileRow;
      return jsonResponse({
        success: true,
        zos_id: row.zos_id,
        username: row.username,
        balance: Number(row.balance),
      }, 200);
    }

    // ============================================================
    // Route: /zos-auth/debit — subtract from a user's ZOS balance
    // ============================================================
    if (route === "debit") {
      const { api_key, zos_id, amount, note } = body as BalanceAdjustRequest;

      if (!api_key || !zos_id || amount === undefined) {
        return jsonResponse({ success: false, error: "Missing api_key, zos_id, or amount" }, 400);
      }

      const numericAmount = Math.abs(Number(amount));
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return jsonResponse({ success: false, error: "Amount must be a positive number" }, 400);
      }

      const { data, error } = await supabase.rpc("adjust_balance", {
        p_api_key: String(api_key),
        p_zos_id: String(zos_id),
        p_amount: -numericAmount,
        p_note: note ? String(note) : null,
      });

      if (error) {
        return jsonResponse({ success: false, error: "Adjustment failed" }, 500);
      }

      const result = data as AdjustResult;
      if (!result?.success) {
        const status = result?.error === "Insufficient balance" ? 422 : 400;
        return jsonResponse({ success: false, error: result?.error || "Failed" }, status);
      }

      return jsonResponse({
        success: true,
        zos_id: result.zos_id,
        username: result.username,
        balance: Number(result.balance),
      }, 200);
    }

    // ============================================================
    // Route: /zos-auth/credit — add to a user's ZOS balance
    // ============================================================
    if (route === "credit") {
      const { api_key, zos_id, amount, note } = body as BalanceAdjustRequest;

      if (!api_key || !zos_id || amount === undefined) {
        return jsonResponse({ success: false, error: "Missing api_key, zos_id, or amount" }, 400);
      }

      const numericAmount = Math.abs(Number(amount));
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        return jsonResponse({ success: false, error: "Amount must be a positive number" }, 400);
      }

      const { data, error } = await supabase.rpc("adjust_balance", {
        p_api_key: String(api_key),
        p_zos_id: String(zos_id),
        p_amount: numericAmount,
        p_note: note ? String(note) : null,
      });

      if (error) {
        return jsonResponse({ success: false, error: "Adjustment failed" }, 500);
      }

      const result = data as AdjustResult;
      if (!result?.success) {
        return jsonResponse({ success: false, error: result?.error || "Failed" }, 400);
      }

      return jsonResponse({
        success: true,
        zos_id: result.zos_id,
        username: result.username,
        balance: Number(result.balance),
      }, 200);
    }

    // ============================================================
    // Route: /zos-auth/verify — API key verification (default)
    // ============================================================
    {
      const keyBody = body as VerifyKeyRequest;
      const apiKey = keyBody.api_key || keyBody.key;

      if (!apiKey) {
        return jsonResponse({ valid: false, error: "Missing api_key field" }, 400);
      }

      const { data, error } = await supabase.rpc("verify_api_key", {
        p_key: String(apiKey),
      });

      if (error) {
        return jsonResponse({ valid: false, error: "Verification failed" }, 500);
      }

      const result = data as VerifyKeyResult;

      if (!result?.valid) {
        return jsonResponse({ valid: false, error: result?.error || "Invalid key" }, 401);
      }

      return jsonResponse({
        valid: true,
        zos_id: result.zos_id,
        username: result.username,
        balance: result.balance !== undefined ? Number(result.balance) : undefined,
        label: result.label,
      }, 200);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});

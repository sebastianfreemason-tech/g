import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getPaidAmountForInvoice, getQpayAccessToken, requireEnv } from "../_shared/qpay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const DEPOSIT_TIMEOUT_MS = 4 * 60 * 1000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { deposit_id } = (await req.json().catch(() => ({}))) as { deposit_id?: unknown };
    if (typeof deposit_id !== "string" || deposit_id.length === 0) {
      return new Response(JSON.stringify({ error: "Missing deposit id" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const userClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Please sign in again" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const adminClient = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: deposit, error: depositError } = await adminClient
      .from("deposits")
      .select("id, status, qpay_invoice_id, created_at")
      .eq("id", deposit_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (depositError) throw new Error(depositError.message);
    if (!deposit) {
      return new Response(JSON.stringify({ error: "Deposit not found" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }
    if (deposit.status === "confirmed") {
      return new Response(JSON.stringify({ status: "confirmed" }), { headers: jsonHeaders });
    }
    if (deposit.status !== "pending" || !deposit.qpay_invoice_id) {
      return new Response(JSON.stringify({ status: deposit.status }), { headers: jsonHeaders });
    }

    const accessToken = await getQpayAccessToken();
    const paidAmount = await getPaidAmountForInvoice(accessToken, deposit.qpay_invoice_id);
    if (paidAmount === null) {
      if (Date.now() - Date.parse(deposit.created_at) < DEPOSIT_TIMEOUT_MS) {
        return new Response(JSON.stringify({ status: "pending" }), { headers: jsonHeaders });
      }
      await adminClient
        .from("deposits")
        .update({ status: "failed" })
        .eq("id", deposit.id)
        .eq("status", "pending");
      return new Response(JSON.stringify({ status: "failed" }), { headers: jsonHeaders });
    }

    const { data, error } = await adminClient.rpc("credit_qpay_deposit", {
      p_invoice_id: deposit.qpay_invoice_id,
      p_paid_amount: paidAmount,
    });
    if (error) throw new Error(error.message);

    const result = data as { error?: string } | null;
    if (result?.error) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 409,
        headers: jsonHeaders,
      });
    }

    return new Response(JSON.stringify({ status: "confirmed" }), { headers: jsonHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});

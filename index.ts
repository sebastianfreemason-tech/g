import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  getInvoiceIdForPayment,
  getPaidAmountForInvoice,
  getQpayAccessToken,
  requireEnv,
} from "../_shared/qpay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function readNotification(req: Request): Promise<Record<string, unknown>> {
  const fromQuery = Object.fromEntries(new URL(req.url).searchParams.entries());
  if (req.method !== "POST") return fromQuery;
  const body = await req.json().catch(() => null);
  return { ...fromQuery, ...(body && typeof body === "object" ? body : {}) };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const notification = await readNotification(req);
    const invoiceIdFromNotice = asString(notification.invoice_id) ?? asString(notification.object_id);
    const paymentId = asString(notification.payment_id);
    if (!invoiceIdFromNotice && !paymentId) {
      return new Response(JSON.stringify({ error: "Missing invoice id" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const accessToken = await getQpayAccessToken();
    const invoiceId =
      invoiceIdFromNotice ?? (paymentId ? await getInvoiceIdForPayment(accessToken, paymentId) : null);
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: "Could not identify invoice" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const paidAmount = await getPaidAmountForInvoice(accessToken, invoiceId);
    if (paidAmount === null) {
      return new Response(JSON.stringify({ status: "not_paid" }), { headers: jsonHeaders });
    }

    const adminClient = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const { data, error } = await adminClient.rpc("credit_qpay_deposit", {
      p_invoice_id: invoiceId,
      p_paid_amount: paidAmount,
    });
    if (error) throw new Error(error.message);

    const result = data as { error?: string; success?: boolean } | null;
    if (result?.error) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: 409,
        headers: jsonHeaders,
      });
    }

    return new Response(JSON.stringify({ status: "credited" }), { headers: jsonHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});

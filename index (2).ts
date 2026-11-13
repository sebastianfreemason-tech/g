import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { getQpayAccessToken, QPAY_BASE_URL, requireEnv } from "../_shared/qpay.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const QPAY_RECEIVER_CODE = "83";

interface QpayInvoice {
  invoice_id: string;
  qr_text?: string;
  qr_image?: string;
  urls?: { name?: string; description?: string; link?: string }[];
}

async function createQpayInvoice(
  accessToken: string,
  amount: number,
  depositId: string,
): Promise<QpayInvoice> {
  const callbackUrl = `${requireEnv("SUPABASE_URL")}/functions/v1/qpay-callback`;
  const res = await fetch(`${QPAY_BASE_URL}/v2/invoice`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      invoice_code: requireEnv("QPAY_INVOICE_CODE"),
      sender_invoice_no: depositId.replace(/-/g, ""),
      invoice_receiver_code: QPAY_RECEIVER_CODE,
      invoice_description: `ZOS deposit ${depositId.slice(0, 8)}`,
      amount,
      callback_url: callbackUrl,
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || typeof body?.invoice_id !== "string") {
    throw new Error(`Qpay invoice creation failed (${res.status})`);
  }
  return body as QpayInvoice;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { amount } = (await req.json()) as { amount?: unknown };
    const parsedAmount = typeof amount === "number" ? amount : Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return new Response(JSON.stringify({ error: "Enter a valid amount" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: created, error: createError } = await userClient.rpc("create_deposit", {
      p_amount: parsedAmount,
    });
    if (createError) throw new Error(createError.message);
    const createResult = created as { error?: string; success?: boolean; deposit_id?: string } | null;
    if (createResult?.error || !createResult?.deposit_id) {
      return new Response(JSON.stringify({ error: createResult?.error ?? "Could not start deposit" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }
    const depositId = createResult.deposit_id;

    const adminClient = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    try {
      const accessToken = await getQpayAccessToken();
      const invoice = await createQpayInvoice(accessToken, parsedAmount, depositId);

      const { error: updateError } = await adminClient
        .from("deposits")
        .update({ qpay_invoice_id: invoice.invoice_id, qr_text: invoice.qr_text ?? null })
        .eq("id", depositId);
      if (updateError) throw new Error(updateError.message);

      return new Response(
        JSON.stringify({
          deposit_id: depositId,
          invoice_id: invoice.invoice_id,
          qr_text: invoice.qr_text ?? null,
          qr_image: invoice.qr_image ?? null,
          urls: invoice.urls ?? [],
        }),
        { headers: jsonHeaders },
      );
    } catch (err) {
      await adminClient.from("deposits").update({ status: "failed" }).eq("id", depositId);
      throw err;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});

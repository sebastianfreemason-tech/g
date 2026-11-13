export const QPAY_BASE_URL = Deno.env.get("QPAY_BASE_URL") ?? "https://merchant.qpay.mn";

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret: ${name}`);
  return value;
}

export async function getQpayAccessToken(): Promise<string> {
  const clientId = requireEnv("QPAY_CLIENT_ID");
  const clientSecret = requireEnv("QPAY_CLIENT_SECRET");
  const res = await fetch(`${QPAY_BASE_URL}/v2/auth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/json",
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || typeof body?.access_token !== "string") {
    throw new Error(`Qpay authentication failed (${res.status})`);
  }
  return body.access_token;
}

interface PaymentRow {
  payment_status?: string;
  payment_amount?: number | string;
}

interface PaymentCheckResponse {
  rows?: PaymentRow[];
}

export async function getPaidAmountForInvoice(accessToken: string, invoiceId: string): Promise<number | null> {
  const res = await fetch(`${QPAY_BASE_URL}/v2/payment/check`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      object_type: "INVOICE",
      object_id: invoiceId,
      offset: { page_number: 1, page_limit: 100 },
    }),
  });
  const body = (await res.json().catch(() => null)) as PaymentCheckResponse | null;
  if (!res.ok || !body || !Array.isArray(body.rows)) {
    throw new Error(`Qpay payment check failed (${res.status})`);
  }
  const paidRows = body.rows.filter((row) => row.payment_status === "PAID");
  if (paidRows.length === 0) return null;
  const total = paidRows.reduce((sum, row) => sum + Number(row.payment_amount ?? 0), 0);
  return Number.isFinite(total) && total > 0 ? total : null;
}

export async function getInvoiceIdForPayment(accessToken: string, paymentId: string): Promise<string | null> {
  const res = await fetch(`${QPAY_BASE_URL}/v2/payment/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await res.json().catch(() => null)) as { object_id?: unknown } | null;
  if (!res.ok || typeof body?.object_id !== "string") return null;
  return body.object_id;
}

/*
# Qpay deposit flow: server-only crediting

1. Summary
- Deposits are now paid through Qpay Quick QR. Each deposit stores its Qpay invoice ID and the QR text shown to the user.
- Balances are credited only by the server after Qpay confirms the payment.

2. Changes
- deposits: new column `qpay_invoice_id` (unique Qpay invoice reference) and `qr_text` (the QR payload shown to the user). Existing rows are unchanged.
- Removed the `confirm_deposit` function. It let a signed-in user mark their own pending deposit as confirmed without paying. This is a security fix.
- New function `credit_qpay_deposit(invoice_id, paid_amount)`. It credits the balance once, only for a pending deposit whose amount matches the paid amount. It is callable only by the server (service role).

3. Security
- `credit_qpay_deposit` is revoked from public, anon and authenticated.
- `create_deposit` keeps its daily limit check and remains available to signed-in users.

4. Notes
- Calling credit_qpay_deposit again for an already confirmed deposit is a no-op, so repeated Qpay notifications never double-credit.
*/

ALTER TABLE deposits ADD COLUMN IF NOT EXISTS qpay_invoice_id text;
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS qr_text text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_deposits_qpay_invoice_id ON deposits(qpay_invoice_id) WHERE qpay_invoice_id IS NOT NULL;

DROP FUNCTION IF EXISTS public.confirm_deposit(uuid);

CREATE OR REPLACE FUNCTION public.credit_qpay_deposit(p_invoice_id text, p_paid_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  deposit_record deposits%ROWTYPE;
BEGIN
  SELECT * INTO deposit_record FROM deposits WHERE qpay_invoice_id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Deposit not found');
  END IF;

  IF deposit_record.status = 'confirmed' THEN
    RETURN jsonb_build_object('success', true, 'already_confirmed', true);
  END IF;

  IF deposit_record.status <> 'pending' THEN
    RETURN jsonb_build_object('error', 'Deposit is not pending');
  END IF;

  IF deposit_record.amount <> p_paid_amount THEN
    RETURN jsonb_build_object('error', 'Paid amount does not match deposit');
  END IF;

  UPDATE profiles SET balance = balance + deposit_record.amount WHERE id = deposit_record.user_id;
  UPDATE deposits SET status = 'confirmed', confirmed_at = now() WHERE id = deposit_record.id;

  INSERT INTO transactions (sender_id, receiver_id, amount, type, note)
  VALUES (NULL, deposit_record.user_id, deposit_record.amount, 'deposit', 'Qpay deposit');

  RETURN jsonb_build_object('success', true, 'already_confirmed', false);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.credit_qpay_deposit(text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_qpay_deposit(text, numeric) TO service_role;

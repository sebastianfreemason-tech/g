/*
# Add 50 ZOS transfer fee to player-to-player sends

1. What changes
- Every user-to-user transfer made through send_zos now costs the sender an extra 50 ZOS.
- The receiver still gets exactly the amount the sender entered.
- The 50 ZOS fee is removed from circulation (not paid to any account).

2. Transaction history
- The transfer itself is recorded as before (type 'transfer').
- The fee is recorded as a separate row (type 'adjustment', no receiver, note 'Transfer fee') so it appears in history.

3. Security
- Function signature, SECURITY DEFINER setting, and EXECUTE grants are unchanged.

4. Notes
- A sender must have at least amount + 50 ZOS available, otherwise the transfer is rejected.
- Deposits, withdrawals, and admin adjustments are not affected.
*/

CREATE OR REPLACE FUNCTION public.send_zos(p_receiver_zos_id text, p_amount numeric, p_note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  sender_record profiles%ROWTYPE;
  receiver_record profiles%ROWTYPE;
  transfer_fee constant numeric(18,2) := 50;
  new_balance numeric(18,2);
BEGIN
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('error', 'Amount must be greater than zero');
  END IF;

  SELECT * INTO sender_record FROM profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Sender profile not found');
  END IF;

  IF sender_record.is_banned THEN
    RETURN jsonb_build_object('error', 'This account is suspended');
  END IF;

  SELECT * INTO receiver_record FROM profiles WHERE zos_id = p_receiver_zos_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Recipient not found');
  END IF;

  IF sender_record.id = receiver_record.id THEN
    RETURN jsonb_build_object('error', 'Cannot send ZOS to yourself');
  END IF;

  IF sender_record.balance < p_amount + transfer_fee THEN
    RETURN jsonb_build_object('error', 'Insufficient balance (a 50 ZOS transfer fee applies)');
  END IF;

  UPDATE profiles SET balance = balance - p_amount - transfer_fee WHERE id = sender_record.id;
  UPDATE profiles SET balance = balance + p_amount WHERE id = receiver_record.id;

  INSERT INTO transactions (sender_id, receiver_id, amount, type, note)
  VALUES (sender_record.id, receiver_record.id, p_amount, 'transfer', p_note);

  INSERT INTO transactions (sender_id, receiver_id, amount, type, note)
  VALUES (sender_record.id, NULL, transfer_fee, 'adjustment', 'Transfer fee');

  new_balance := sender_record.balance - p_amount - transfer_fee;

  RETURN jsonb_build_object('success', true, 'new_balance', new_balance);
END;
$function$;

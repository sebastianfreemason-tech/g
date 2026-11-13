/*
# Withdrawal bank account number must be exactly 10 digits

1. Summary
- Bank account numbers submitted with a withdrawal must now be exactly 10 digits.

2. Changed functions
- `create_withdrawal` rejects any account number that is not exactly 10 digits. All other checks are unchanged.

3. Existing data
- Previously submitted withdrawals are not modified.
*/

CREATE OR REPLACE FUNCTION public.create_withdrawal(p_amount numeric, p_bank_name text, p_account_number text, p_account_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user profiles%ROWTYPE;
  v_bank text := btrim(COALESCE(p_bank_name, ''));
  v_number text := btrim(COALESCE(p_account_number, ''));
  v_name text := btrim(COALESCE(p_account_name, ''));
  v_withdrawable numeric;
  v_withdrawal_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount < 1000 OR p_amount > 10000000 OR p_amount <> round(p_amount, 2) THEN
    RETURN jsonb_build_object('error', 'Withdrawal must be between 1,000 and 10,000,000 ₮');
  END IF;

  IF char_length(v_bank) < 2 OR char_length(v_bank) > 100 THEN
    RETURN jsonb_build_object('error', 'Choose a bank');
  END IF;

  IF v_number !~ '^[0-9]{10}$' THEN
    RETURN jsonb_build_object('error', 'Bank account number must be exactly 10 digits');
  END IF;

  IF char_length(v_name) < 2 OR char_length(v_name) > 100 THEN
    RETURN jsonb_build_object('error', 'Enter the account holder name');
  END IF;

  SELECT * INTO v_user FROM profiles WHERE id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;

  IF v_user.is_banned THEN
    RETURN jsonb_build_object('error', 'This account is suspended');
  END IF;

  v_withdrawable := public.withdrawable_amount(v_user.id);

  IF v_withdrawable < 1000 THEN
    RETURN jsonb_build_object('error', 'Nothing is withdrawable yet. Withdrawals open once a deposit has grown to 1.5x');
  END IF;

  IF p_amount > v_withdrawable THEN
    RETURN jsonb_build_object('error', 'You can withdraw up to ' || to_char(v_withdrawable, 'FM999,999,999,990.00') || ' ₮ right now');
  END IF;

  UPDATE profiles SET balance = balance - p_amount WHERE id = v_user.id;

  INSERT INTO withdrawals (user_id, amount, bank_name, account_number, account_name)
  VALUES (v_user.id, p_amount, v_bank, v_number, v_name)
  RETURNING id INTO v_withdrawal_id;

  INSERT INTO transactions (sender_id, receiver_id, amount, type, note)
  VALUES (v_user.id, NULL, p_amount, 'adjustment', 'Bank withdrawal');

  RETURN jsonb_build_object('success', true, 'withdrawal_id', v_withdrawal_id, 'new_balance', v_user.balance - p_amount);
END;
$function$;

/*
# Admin credits count as deposits; withdrawal rule uses one shared total

1. New function
- `player_total_deposits(user_id)` returns a player's total money in: confirmed QPay deposits plus every balance amount an admin has added (from the admin audit log).

2. Changed functions
- `get_withdrawal_eligibility` and `create_withdrawal` both use `player_total_deposits`, so admin-added balance now counts toward the 1.5x unlock.
- Unlock rule is unchanged otherwise: at least one deposit, and balance at least 1.5 x the total.

3. Security
- `player_total_deposits` is callable only from other server-side functions; clients cannot call it directly.
*/

CREATE OR REPLACE FUNCTION public.player_total_deposits(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE((SELECT SUM(amount) FROM deposits WHERE user_id = p_user_id AND status = 'confirmed'), 0)
    + COALESCE((SELECT SUM(amount) FROM admin_actions WHERE target_id = p_user_id AND action = 'add_balance'), 0);
$function$;

REVOKE EXECUTE ON FUNCTION public.player_total_deposits(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION get_withdrawal_eligibility()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_deposited numeric;
  v_required numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT balance INTO v_balance FROM profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;

  v_deposited := public.player_total_deposits(auth.uid());
  v_required := round(v_deposited * 1.5, 2);

  RETURN jsonb_build_object(
    'total_deposited', v_deposited,
    'required_balance', v_required,
    'balance', v_balance,
    'remaining', GREATEST(v_required - v_balance, 0),
    'eligible', v_deposited > 0 AND v_balance >= v_required
  );
END;
$$;

CREATE OR REPLACE FUNCTION create_withdrawal(p_amount numeric, p_bank_name text, p_account_number text, p_account_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user profiles%ROWTYPE;
  v_bank text := btrim(COALESCE(p_bank_name, ''));
  v_number text := btrim(COALESCE(p_account_number, ''));
  v_name text := btrim(COALESCE(p_account_name, ''));
  v_deposited numeric;
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

  IF v_number !~ '^[0-9]{6,30}$' THEN
    RETURN jsonb_build_object('error', 'Enter a valid bank account number (digits only)');
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

  v_deposited := public.player_total_deposits(v_user.id);
  IF v_deposited <= 0 OR v_user.balance < round(v_deposited * 1.5, 2) THEN
    RETURN jsonb_build_object('error', 'Withdrawals unlock when your balance reaches 1.5x your total deposits');
  END IF;

  IF v_user.balance < p_amount THEN
    RETURN jsonb_build_object('error', 'Insufficient balance');
  END IF;

  UPDATE profiles SET balance = balance - p_amount WHERE id = v_user.id;

  INSERT INTO withdrawals (user_id, amount, bank_name, account_number, account_name)
  VALUES (v_user.id, p_amount, v_bank, v_number, v_name)
  RETURNING id INTO v_withdrawal_id;

  INSERT INTO transactions (sender_id, receiver_id, amount, type, note)
  VALUES (v_user.id, NULL, p_amount, 'adjustment', 'Bank withdrawal');

  RETURN jsonb_build_object('success', true, 'withdrawal_id', v_withdrawal_id, 'new_balance', v_user.balance - p_amount);
END;
$$;

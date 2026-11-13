/*
# Bank transfer withdrawals with admin approval

1. Summary
- Players can withdraw ZOS to a bank account in MNT.
- The amount is deducted from the player's balance when the request is made.
- Admins review pending requests, then either mark the transfer as sent or reject it. A rejected request refunds the balance.

2. New tables
- `withdrawals`: one row per request, with amount, bank name, account number, account holder name, status (pending, completed, rejected), and who resolved it.
  Players can read only their own rows. Clients cannot insert, update or delete; all changes go through functions below.

3. Changed tables
- `admin_actions.action` now also accepts `withdrawal_completed` and `withdrawal_rejected` so withdrawal decisions appear in the audit log.

4. New functions
- `create_withdrawal(amount, bank_name, account_number, account_name)`: validates the request, locks the player's row, deducts the balance, creates the pending request and a transaction record. Banned accounts are refused.
- `admin_list_withdrawals(status)`: lists requests for admins, oldest first.
- `admin_resolve_withdrawal(withdrawal_id, approve, note)`: approve marks the request completed; reject refunds the amount and marks it rejected. Each request can be resolved once.

5. Security
- Every admin function checks `is_admin()` before doing anything.
- Amount limits: 1,000 to 10,000,000 MNT per request. Account numbers must be 6 to 30 digits.
- Balance changes lock the player's row, so a player cannot withdraw more than they hold by sending requests at the same time.

6. Notes
- Bank transfers are sent manually by the admin outside the app. Marking a request completed does not move money by itself.
*/

ALTER TABLE admin_actions DROP CONSTRAINT IF EXISTS admin_actions_action_check;
ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_check
  CHECK (action IN ('add_balance', 'remove_balance', 'ban', 'unban', 'withdrawal_completed', 'withdrawal_rejected'));

CREATE TABLE IF NOT EXISTS withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  bank_name text NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status_created ON withdrawals(status, created_at);

ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON withdrawals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON withdrawals TO authenticated;

DROP POLICY IF EXISTS "select_own_withdrawals" ON withdrawals;
CREATE POLICY "select_own_withdrawals" ON withdrawals FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

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
$function$;

CREATE OR REPLACE FUNCTION public.admin_list_withdrawals(p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('pending', 'completed', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_data)
    FROM (
      SELECT jsonb_build_object(
        'id', w.id,
        'amount', w.amount,
        'bank_name', w.bank_name,
        'account_number', w.account_number,
        'account_name', w.account_name,
        'status', w.status,
        'created_at', w.created_at,
        'username', p.username,
        'zos_id', p.zos_id
      ) AS row_data
      FROM withdrawals w
      JOIN profiles p ON p.id = w.user_id
      WHERE w.status = p_status
      ORDER BY w.created_at ASC
      LIMIT 100
    ) queue
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_resolve_withdrawal(p_withdrawal_id uuid, p_approve boolean, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_withdrawal withdrawals%ROWTYPE;
  v_note text := NULLIF(left(btrim(COALESCE(p_note, '')), 200), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_approve IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid operation');
  END IF;

  SELECT * INTO v_withdrawal FROM withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Withdrawal not found');
  END IF;

  IF v_withdrawal.status <> 'pending' THEN
    RETURN jsonb_build_object('error', 'This withdrawal has already been processed');
  END IF;

  IF p_approve THEN
    UPDATE withdrawals
    SET status = 'completed', resolved_at = now(), resolved_by = auth.uid(), admin_note = v_note
    WHERE id = v_withdrawal.id;

    INSERT INTO admin_actions (admin_id, target_id, action, amount, note)
    VALUES (auth.uid(), v_withdrawal.user_id, 'withdrawal_completed', v_withdrawal.amount, v_note);

    RETURN jsonb_build_object('success', true, 'status', 'completed');
  END IF;

  UPDATE profiles SET balance = balance + v_withdrawal.amount WHERE id = v_withdrawal.user_id;

  UPDATE withdrawals
  SET status = 'rejected', resolved_at = now(), resolved_by = auth.uid(), admin_note = v_note
  WHERE id = v_withdrawal.id;

  INSERT INTO transactions (sender_id, receiver_id, amount, type, note)
  VALUES (NULL, v_withdrawal.user_id, v_withdrawal.amount, 'adjustment', 'Withdrawal refund');

  INSERT INTO admin_actions (admin_id, target_id, action, amount, note)
  VALUES (auth.uid(), v_withdrawal.user_id, 'withdrawal_rejected', v_withdrawal.amount, v_note);

  RETURN jsonb_build_object('success', true, 'status', 'rejected');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_withdrawal(numeric, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_withdrawals(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_resolve_withdrawal(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_withdrawal(numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_withdrawals(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_withdrawal(uuid, boolean, text) TO authenticated;

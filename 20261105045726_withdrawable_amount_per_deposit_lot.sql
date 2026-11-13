/*
# Withdrawable amount tracked per deposit

1. Summary
- Every deposit (QPay payment or admin-added balance) becomes a "lot" that remembers the balance the player had just before it was credited.
- A lot is "moved" once the player's balance reaches its balance before deposit plus 1.5x the lot amount. Once moved, it stays moved.
- Withdrawable amount = balance minus the amount of lots that have not moved yet. Withdrawals are capped at this amount.
- A later small deposit can never be withdrawn together with an older deposit's gains, because it stays locked until it has moved on its own.

2. New table
- `deposit_lots`: one row per deposit. Clients have no direct access; only server functions read or write it.

3. Triggers
- After any change to a player's balance, lots that have reached their 1.5x threshold are marked moved.

4. Changed functions
- `credit_qpay_deposit` and `admin_adjust_balance` (add) record a lot before crediting.
- `get_withdrawal_eligibility` returns balance, locked amount, withdrawable amount, and how much more the next lot needs.
- `create_withdrawal` refuses amounts above the withdrawable amount.
- `player_total_deposits` is removed; it is replaced by the lots.

5. Existing players
- Past deposits and admin credits are converted to lots. Each lot's starting balance is the sum of earlier lots, so a player's older deposits are not double-counted.
*/

CREATE TABLE IF NOT EXISTS deposit_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  base_balance numeric(18,2) NOT NULL,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deposit_lots_unmoved ON deposit_lots(user_id) WHERE released_at IS NULL;

ALTER TABLE deposit_lots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON deposit_lots FROM PUBLIC, anon, authenticated;

INSERT INTO deposit_lots (user_id, amount, base_balance, released_at, created_at)
SELECT
  y.user_id,
  y.amount,
  y.base_balance,
  CASE WHEN y.current_balance >= y.base_balance + round(y.amount * 1.5, 2) THEN now() END,
  y.at
FROM (
  SELECT
    x.user_id,
    x.amount,
    x.at,
    COALESCE(SUM(x.amount) OVER (
      PARTITION BY x.user_id ORDER BY x.at
      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
    ), 0) AS base_balance,
    p.balance AS current_balance
  FROM (
    SELECT user_id, amount, COALESCE(confirmed_at, created_at) AS at
    FROM deposits
    WHERE status = 'confirmed'
    UNION ALL
    SELECT target_id, amount, created_at
    FROM admin_actions
    WHERE action = 'add_balance'
  ) x
  JOIN profiles p ON p.id = x.user_id
) y;

CREATE OR REPLACE FUNCTION public.release_moved_deposit_lots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE deposit_lots
  SET released_at = now()
  WHERE user_id = NEW.id
    AND released_at IS NULL
    AND NEW.balance >= base_balance + round(amount * 1.5, 2);
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.release_moved_deposit_lots() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_release_moved_deposit_lots ON profiles;
CREATE TRIGGER profiles_release_moved_deposit_lots
  AFTER UPDATE OF balance ON profiles
  FOR EACH ROW
  WHEN (NEW.balance IS DISTINCT FROM OLD.balance)
  EXECUTE FUNCTION public.release_moved_deposit_lots();

CREATE OR REPLACE FUNCTION public.withdrawable_amount(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT GREATEST(
    p.balance - COALESCE((
      SELECT SUM(l.amount) FROM deposit_lots l WHERE l.user_id = p.id AND l.released_at IS NULL
    ), 0),
    0
  )
  FROM profiles p
  WHERE p.id = p_user_id;
$function$;

REVOKE EXECUTE ON FUNCTION public.withdrawable_amount(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.credit_qpay_deposit(p_invoice_id text, p_paid_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  deposit_record deposits%ROWTYPE;
  v_balance numeric(18,2);
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

  SELECT balance INTO v_balance FROM profiles WHERE id = deposit_record.user_id FOR UPDATE;

  INSERT INTO deposit_lots (user_id, amount, base_balance)
  VALUES (deposit_record.user_id, deposit_record.amount, v_balance);

  UPDATE profiles SET balance = balance + deposit_record.amount WHERE id = deposit_record.user_id;
  UPDATE deposits SET status = 'confirmed', confirmed_at = now() WHERE id = deposit_record.id;

  INSERT INTO transactions (sender_id, receiver_id, amount, type, note)
  VALUES (NULL, deposit_record.user_id, deposit_record.amount, 'deposit', 'Qpay deposit');

  RETURN jsonb_build_object('success', true, 'already_confirmed', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_adjust_balance(p_zos_id text, p_amount numeric, p_mode text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target profiles%ROWTYPE;
  v_new_balance numeric(18,2);
  v_note text := NULLIF(left(btrim(COALESCE(p_note, '')), 200), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_mode IS NULL OR p_mode NOT IN ('add', 'remove') THEN
    RETURN jsonb_build_object('error', 'Invalid operation');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000000 THEN
    RETURN jsonb_build_object('error', 'Amount must be between 0.01 and 1,000,000,000');
  END IF;

  IF p_zos_id IS NULL OR p_zos_id !~ '^[0-9]{8}$' THEN
    RETURN jsonb_build_object('error', 'Enter an 8-digit ZOS ID');
  END IF;

  SELECT * INTO v_target FROM profiles WHERE zos_id = p_zos_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'No player found with that ZOS ID');
  END IF;

  IF p_mode = 'add' THEN
    INSERT INTO deposit_lots (user_id, amount, base_balance)
    VALUES (v_target.id, p_amount, v_target.balance);

    UPDATE profiles SET balance = balance + p_amount WHERE id = v_target.id
    RETURNING balance INTO v_new_balance;

    INSERT INTO transactions (sender_id, receiver_id, amount, type, note)
    VALUES (NULL, v_target.id, p_amount, 'adjustment', COALESCE(v_note, 'Admin credit'));

    INSERT INTO admin_actions (admin_id, target_id, action, amount, note)
    VALUES (auth.uid(), v_target.id, 'add_balance', p_amount, v_note);
  ELSE
    IF v_target.balance < p_amount THEN
      RETURN jsonb_build_object('error', 'Insufficient balance. The player has ' || v_target.balance::text || ' ₮');
    END IF;

    UPDATE profiles SET balance = balance - p_amount WHERE id = v_target.id
    RETURNING balance INTO v_new_balance;

    INSERT INTO transactions (sender_id, receiver_id, amount, type, note)
    VALUES (v_target.id, NULL, p_amount, 'adjustment', COALESCE(v_note, 'Admin debit'));

    INSERT INTO admin_actions (admin_id, target_id, action, amount, note)
    VALUES (auth.uid(), v_target.id, 'remove_balance', p_amount, v_note);
  END IF;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_withdrawal_eligibility()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric;
  v_locked numeric;
  v_withdrawable numeric;
  v_next_gap numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT balance INTO v_balance FROM profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_locked
  FROM deposit_lots WHERE user_id = auth.uid() AND released_at IS NULL;

  v_withdrawable := public.withdrawable_amount(auth.uid());

  SELECT MIN(base_balance + round(amount * 1.5, 2)) - v_balance INTO v_next_gap
  FROM deposit_lots WHERE user_id = auth.uid() AND released_at IS NULL;

  RETURN jsonb_build_object(
    'balance', v_balance,
    'locked_amount', v_locked,
    'withdrawable', v_withdrawable,
    'next_unlock_gap', CASE WHEN v_next_gap IS NULL THEN NULL ELSE GREATEST(v_next_gap, 0) END,
    'eligible', v_withdrawable >= 1000
  );
END;
$function$;

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

DROP FUNCTION IF EXISTS public.player_total_deposits(uuid);

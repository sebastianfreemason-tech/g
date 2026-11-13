-- ============================================================
-- ZOS Balance Sync for External Apps (e.g. Zethbet)
-- ============================================================
-- Adds an 'adjustment' transaction type so debits/credits from
-- external apps are recorded in the ZOS transaction history with
-- a human-readable source label (e.g. "Zethbet").
--
-- adjust_balance is a SECURITY DEFINER function callable by anon
-- (the edge function uses the service role key). It verifies an
-- API key, checks the user has sufficient balance for debits, and
-- atomically updates the balance + records the transaction.
-- ============================================================

-- Allow 'adjustment' as a transaction type
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('transfer', 'deposit', 'adjustment'));

ALTER TABLE transactions ALTER COLUMN note TYPE text;

-- ============================================================
-- FUNCTION: adjust_balance
-- Called by the edge function when an external app debits or
-- credits a user. Verified via API key (not Supabase session).
-- ============================================================
CREATE OR REPLACE FUNCTION public.adjust_balance(
  p_api_key text,
  p_zos_id text,
  p_amount numeric,
  p_note text DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key_record api_keys%ROWTYPE;
  user_record profiles%ROWTYPE;
  calc_hash text;
  new_balance numeric(18,2);
BEGIN
  -- Validate API key
  IF p_api_key IS NULL OR p_api_key = '' OR NOT starts_with(p_api_key, 'zos_live_') THEN
    RETURN jsonb_build_object('error', 'Invalid API key format');
  END IF;

  calc_hash := encode(digest(p_api_key, 'sha256'), 'hex');

  SELECT * INTO key_record FROM api_keys
    WHERE key_hash = calc_hash AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or revoked API key');
  END IF;

  -- Look up the target user by zos_id
  SELECT * INTO user_record FROM profiles WHERE zos_id = p_zos_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  -- Amount must be non-zero
  IF p_amount = 0 THEN
    RETURN jsonb_build_object('error', 'Amount must be non-zero');
  END IF;

  -- For debits (negative amount), check sufficient balance
  IF p_amount < 0 AND user_record.balance < ABS(p_amount) THEN
    RETURN jsonb_build_object('error', 'Insufficient balance', 'balance', user_record.balance);
  END IF;

  -- Apply the adjustment
  UPDATE profiles SET balance = balance + p_amount WHERE id = user_record.id
    RETURNING balance INTO new_balance;

  -- Record the transaction
  INSERT INTO transactions (sender_id, receiver_id, amount, type, note)
  VALUES (
    CASE WHEN p_amount < 0 THEN user_record.id ELSE NULL END,
    CASE WHEN p_amount >= 0 THEN user_record.id ELSE NULL END,
    ABS(p_amount),
    'adjustment',
    COALESCE(p_note, key_record.label)
  );

  -- Update last used on the API key
  UPDATE api_keys SET last_used_at = now() WHERE id = key_record.id;

  RETURN jsonb_build_object(
    'success', true,
    'zos_id', user_record.zos_id,
    'username', user_record.username,
    'balance', new_balance,
    'label', key_record.label
  );
END;
$$ LANGUAGE plpgsql;

-- Grant execute to anon (edge function calls this with service role key anyway)
REVOKE EXECUTE ON FUNCTION public.adjust_balance(text, text, numeric, text) FROM authenticated, public;
GRANT EXECUTE ON FUNCTION public.adjust_balance(text, text, numeric, text) TO anon;

-- An API key may only adjust or read the balance of the account it belongs to.
CREATE OR REPLACE FUNCTION public.adjust_balance(
  p_api_key text,
  p_zos_id text,
  p_amount numeric,
  p_note text DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  key_record api_keys%ROWTYPE;
  user_record profiles%ROWTYPE;
  calc_hash text;
  new_balance numeric(18,2);
BEGIN
  IF p_api_key IS NULL OR p_api_key = '' OR NOT starts_with(p_api_key, 'zos_live_') THEN
    RETURN jsonb_build_object('error', 'Invalid API key format');
  END IF;

  calc_hash := encode(digest(p_api_key, 'sha256'), 'hex');

  SELECT * INTO key_record FROM api_keys
    WHERE key_hash = calc_hash AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or revoked API key');
  END IF;

  SELECT * INTO user_record FROM profiles WHERE zos_id = p_zos_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'User not found');
  END IF;

  IF user_record.id <> key_record.user_id THEN
    RETURN jsonb_build_object('error', 'API key does not belong to this user');
  END IF;

  IF p_amount = 0 THEN
    RETURN jsonb_build_object('error', 'Amount must be non-zero');
  END IF;

  IF p_amount < 0 AND user_record.balance < ABS(p_amount) THEN
    RETURN jsonb_build_object('error', 'Insufficient balance', 'balance', user_record.balance);
  END IF;

  UPDATE profiles SET balance = balance + p_amount WHERE id = user_record.id
    RETURNING balance INTO new_balance;

  INSERT INTO transactions (sender_id, receiver_id, amount, type, note)
  VALUES (
    CASE WHEN p_amount < 0 THEN user_record.id ELSE NULL END,
    CASE WHEN p_amount >= 0 THEN user_record.id ELSE NULL END,
    ABS(p_amount),
    'adjustment',
    COALESCE(p_note, key_record.label)
  );

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

REVOKE EXECUTE ON FUNCTION public.adjust_balance(text, text, numeric, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.adjust_balance(text, text, numeric, text) TO service_role;

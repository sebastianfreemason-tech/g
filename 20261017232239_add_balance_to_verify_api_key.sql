-- Modify verify_api_key to also return the user's balance
-- so external apps can read the current ZOS balance with an API key.

CREATE OR REPLACE FUNCTION public.verify_api_key(p_key text)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key_record api_keys%ROWTYPE;
  user_record profiles%ROWTYPE;
  calc_hash text;
BEGIN
  IF p_key IS NULL OR p_key = '' OR NOT starts_with(p_key, 'zos_live_') THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Invalid key format');
  END IF;

  calc_hash := encode(digest(p_key, 'sha256'), 'hex');

  SELECT * INTO key_record FROM api_keys WHERE key_hash = calc_hash AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Key not found or revoked');
  END IF;

  -- Update last used
  UPDATE api_keys SET last_used_at = now() WHERE id = key_record.id;

  -- Get user info including balance
  SELECT zos_id, username, balance INTO user_record FROM profiles WHERE id = key_record.user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'User not found');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'zos_id', user_record.zos_id,
    'username', user_record.username,
    'balance', user_record.balance,
    'label', key_record.label
  );
END;
$$ LANGUAGE plpgsql;

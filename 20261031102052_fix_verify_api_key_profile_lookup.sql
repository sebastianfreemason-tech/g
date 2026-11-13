-- verify_api_key selected three columns into a full profiles row variable,
-- which broke the lookup. Select the full row instead.
CREATE OR REPLACE FUNCTION public.verify_api_key(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

  SELECT * INTO key_record FROM api_keys
    WHERE key_hash = calc_hash AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'Key not found or revoked');
  END IF;

  UPDATE api_keys SET last_used_at = now() WHERE id = key_record.id;

  SELECT * INTO user_record FROM profiles WHERE id = key_record.user_id;
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
$$;

REVOKE EXECUTE ON FUNCTION public.verify_api_key(text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.verify_api_key(text) TO service_role;

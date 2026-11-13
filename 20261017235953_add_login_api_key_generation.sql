-- ============================================================
-- Auto-generate API key on login for external apps
-- ============================================================
-- Adds a function that revokes any existing non-revoked key with
-- the same label for the user, then creates a fresh one and
-- returns the raw key. Called by the edge function after
-- credentials are verified (uses service role key, so takes
-- p_user_id as a parameter instead of auth.uid()).
-- ============================================================

CREATE OR REPLACE FUNCTION public.login_generate_api_key(
  p_user_id uuid,
  p_label text DEFAULT 'External App'
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_key text;
  key_hash text;
  new_id uuid;
  user_record profiles%ROWTYPE;
  clean_label text;
BEGIN
  SELECT * INTO user_record FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;

  clean_label := COALESCE(NULLIF(trim(p_label), ''), 'External App');

  -- Revoke any existing non-revoked keys with the same label
  UPDATE api_keys SET revoked_at = now()
    WHERE user_id = p_user_id
      AND label = clean_label
      AND revoked_at IS NULL;

  -- Generate new key
  raw_key := 'zos_live_' || encode(gen_random_bytes(24), 'hex');
  key_hash := encode(digest(raw_key, 'sha256'), 'hex');

  INSERT INTO api_keys (user_id, key_hash, label)
  VALUES (p_user_id, key_hash, clean_label)
  RETURNING id INTO new_id;

  RETURN jsonb_build_object(
    'success', true,
    'api_key', raw_key,
    'key_id', new_id,
    'label', clean_label
  );
END;
$$ LANGUAGE plpgsql;

REVOKE EXECUTE ON FUNCTION public.login_generate_api_key(uuid, text) FROM authenticated, public;
GRANT EXECUTE ON FUNCTION public.login_generate_api_key(uuid, text) TO anon;

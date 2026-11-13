/*
# ZOS API Keys — External Authentication

## Overview
Adds an API key system so external apps (like Zethbet) can authenticate ZOS users.
Users generate secret API keys from their ZOS wallet. External apps send the key to
the `zos-auth` edge function, which returns the user's ZOS ID and username — verifying
the key is valid without exposing the user's password or balance.

## New Tables

### api_keys
- `id` (uuid, PK)
- `user_id` (uuid, references profiles) — the ZOS user who owns the key
- `key_hash` (text, unique) — SHA-256 hash of the secret key (the raw key is never stored)
- `label` (text) — user-given name like "Zethbet"
- `last_used_at` (timestamptz, nullable) — updated when the key is verified
- `created_at` (timestamptz)
- `revoked_at` (timestamptz, nullable) — set when user revokes the key

## New Functions

### generate_api_key(p_label text)
Creates a new API key for the authenticated user. Returns the raw key (shown once).
The key format: `zos_live_` + 48 hex chars. Only the hash is stored.

### verify_api_key(p_key text)
SECURITY DEFINER function called by the edge function. Looks up the key by hash,
checks it's not revoked, updates last_used_at, and returns the user's zos_id + username.
Returns an error if the key is invalid or revoked.

### revoke_api_key(p_key_id uuid)
Marks a key as revoked. Only the owner can revoke.

### get_my_api_keys()
Returns all non-revoked API keys for the authenticated user (without the key hash).

## Security
- RLS on api_keys: users can only SELECT their own keys (for listing/revoking).
- INSERT/UPDATE/DELETE are blocked directly — all mutations go through SECURITY DEFINER functions.
- Raw API keys are NEVER stored. Only SHA-256 hashes.
- verify_api_key is executable by anon (the edge function uses the service role key, but
  the function itself checks the key hash, not auth.uid()).
- The edge function is public (verify_jwt: false) since external apps call it with an API key, not a Supabase session.
*/

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key_hash text UNIQUE NOT NULL,
  label text NOT NULL DEFAULT 'Default',
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_api_keys" ON api_keys;
CREATE POLICY "select_own_api_keys"
ON api_keys FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- ============================================================
-- FUNCTION: Generate a new API key
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_api_key(p_label text DEFAULT 'Default')
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw_key text;
  key_hash text;
  new_id uuid;
  user_record profiles%ROWTYPE;
BEGIN
  SELECT * INTO user_record FROM profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;

  -- Generate key: zos_live_ + 48 hex chars
  raw_key := 'zos_live_' || encode(gen_random_bytes(24), 'hex');

  -- Hash with SHA-256
  key_hash := encode(digest(raw_key, 'sha256'), 'hex');

  INSERT INTO api_keys (user_id, key_hash, label)
  VALUES (user_record.id, key_hash, COALESCE(NULLIF(trim(p_label), ''), 'Default'))
  RETURNING id INTO new_id;

  RETURN jsonb_build_object('success', true, 'key_id', new_id, 'api_key', raw_key);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Verify an API key (called by edge function)
-- ============================================================
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

  -- Get user info
  SELECT zos_id, username INTO user_record FROM profiles WHERE id = key_record.user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valid', false, 'error', 'User not found');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'zos_id', user_record.zos_id,
    'username', user_record.username,
    'label', key_record.label
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Revoke an API key
-- ============================================================
CREATE OR REPLACE FUNCTION public.revoke_api_key(p_key_id uuid)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  key_record api_keys%ROWTYPE;
BEGIN
  SELECT * INTO key_record FROM api_keys WHERE id = p_key_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Key not found');
  END IF;

  IF key_record.user_id != auth.uid() THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  IF key_record.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'Key already revoked');
  END IF;

  UPDATE api_keys SET revoked_at = now() WHERE id = p_key_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Get my API keys (metadata only, no hash)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_my_api_keys()
RETURNS TABLE (
  id uuid,
  label text,
  last_used_at timestamptz,
  created_at timestamptz
)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT ak.id, ak.label, ak.last_used_at, ak.created_at
  FROM api_keys ak
  WHERE ak.user_id = auth.uid() AND ak.revoked_at IS NULL
  ORDER BY ak.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant execute: wallet functions to authenticated, verify to anon (edge function)
REVOKE EXECUTE ON FUNCTION public.generate_api_key(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generate_api_key(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.verify_api_key(text) FROM authenticated, public;
GRANT EXECUTE ON FUNCTION public.verify_api_key(text) TO anon;

REVOKE EXECUTE ON FUNCTION public.revoke_api_key(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.revoke_api_key(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_api_keys() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_my_api_keys() TO authenticated;

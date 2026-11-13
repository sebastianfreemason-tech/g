-- pgcrypto lives in the "extensions" schema, so functions pinned to
-- search_path = public cannot resolve digest() / gen_random_bytes().
ALTER FUNCTION public.verify_api_key(text) SET search_path = public, extensions;
ALTER FUNCTION public.generate_api_key(text) SET search_path = public, extensions;
ALTER FUNCTION public.adjust_balance(text, text, numeric, text) SET search_path = public, extensions;
ALTER FUNCTION public.login_generate_api_key(uuid, text) SET search_path = public, extensions;

-- login_generate_api_key takes any user id, so only the service role
-- (used by the edge function after verifying credentials) may call it.
REVOKE EXECUTE ON FUNCTION public.login_generate_api_key(uuid, text) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.login_generate_api_key(uuid, text) TO service_role;

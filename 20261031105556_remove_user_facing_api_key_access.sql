-- API keys are managed only by the backend (login/register issue them,
-- the edge function uses them). Signed-in users no longer get key RPCs.
REVOKE EXECUTE ON FUNCTION public.get_my_api_keys() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.generate_api_key(text) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.revoke_api_key(uuid) FROM authenticated, anon, public;

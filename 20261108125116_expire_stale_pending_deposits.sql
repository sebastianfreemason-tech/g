/*
# Auto-fail pending deposits older than 15 minutes

1. What changes
- New function expire_stale_pending_deposits() marks any deposit still 'pending' after 15 minutes as 'failed'.
- Failed deposits no longer count toward the daily 100,000 deposit limit, so players can start a new deposit.

2. When it runs
- The deposit page calls it each time it loads, so stale deposits are cleared when a player opens the page.

3. Security
- SECURITY DEFINER so it can update deposits regardless of row policies.
- Only signed-in users can call it. Anonymous callers cannot.
- It only ever moves pending deposits to failed. It never credits a balance.

4. Notes
- A deposit that is already confirmed is never changed.
- Returns the number of deposits that were expired.
*/

CREATE OR REPLACE FUNCTION public.expire_stale_pending_deposits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  expired_count integer;
BEGIN
  UPDATE deposits
  SET status = 'failed'
  WHERE status = 'pending'
    AND created_at < now() - interval '15 minutes';

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_pending_deposits() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_deposits() TO authenticated;

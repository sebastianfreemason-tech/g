/*
# Restrict SECURITY DEFINER functions to authenticated role

## Overview
The SECURITY DEFINER functions for ZOS wallet operations were executable by the `anon` role.
Since this app requires sign-in (username + password), these functions should only be
callable by authenticated users. This revokes EXECUTE from `anon` and grants it to
`authenticated` only.

## Changes
- REVOKE EXECUTE on all 6 SECURITY DEFINER functions from `anon` and `public`.
- GRANT EXECUTE on all 6 functions to `authenticated` only.

## Functions affected
1. lookup_user_by_zos_id
2. send_zos
3. create_deposit
4. confirm_deposit
5. get_transaction_history
6. get_today_deposit_total

## Security
- Prevents unauthenticated users from calling wallet operations via the REST API.
- All functions remain SECURITY DEFINER with a fixed search_path.
*/

REVOKE EXECUTE ON FUNCTION public.lookup_user_by_zos_id(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.send_zos(text, numeric, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_deposit(numeric) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.confirm_deposit(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_transaction_history() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_today_deposit_total() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.lookup_user_by_zos_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_zos(text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_deposit(numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_deposit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transaction_history() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_today_deposit_total() TO authenticated;

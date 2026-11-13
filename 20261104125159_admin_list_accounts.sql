/*
# Admin: list all accounts

1. New function
- `admin_list_accounts()` returns every player account as a JSON array: account ID, username, ZOS ID, balance, suspension state, whether the account is an admin, and creation time. Oldest first.

2. Security
- The function is SECURITY DEFINER and first checks `is_admin()`; non-admins get a permission error.
- EXECUTE is revoked from PUBLIC and anon, and granted to authenticated only, so the check is always reached.
- No table grants or policies change.
*/

CREATE OR REPLACE FUNCTION admin_list_accounts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(a) ORDER BY a.created_at)
    FROM (
      SELECT
        p.id,
        p.username,
        p.zos_id,
        p.balance,
        p.is_banned,
        p.created_at,
        EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = p.id) AS is_admin
      FROM profiles p
    ) a
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_list_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_list_accounts() TO authenticated;

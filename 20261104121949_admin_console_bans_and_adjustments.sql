/*
# Admin console: bans, balance adjustments, audit log

1. Summary
- Adds an admin role that only server-side functions can check.
- Admins can look up a player by ZOS ID, add or remove balance, and ban or unban players.
- Every admin action is written to an audit log.
- Banned players cannot send ZOS, create deposits, or use their external API keys.

2. New tables
- `admin_users`: which accounts are admins. Clients cannot read or write it.
- `admin_actions`: audit log of admin balance changes and bans. Clients cannot read or write it.

3. Changed tables
- `profiles.is_banned` (boolean, default false). Clients cannot change it; only admin functions can.

4. New functions
- `is_admin()`: true when the signed-in user is listed in `admin_users`.
- `admin_find_user(zos_id)`: returns a player's username, balance and ban status.
- `admin_adjust_balance(zos_id, amount, mode, note)`: adds or removes balance, logs a transaction and an audit entry.
- `admin_set_banned(zos_id, banned)`: bans or unbans a player. Admin accounts cannot be banned.
- `admin_recent_actions(limit)`: lists the latest audit entries.

5. Changed functions
- `send_zos`, `create_deposit`: reject banned accounts.
- `verify_api_key`: reports banned accounts as invalid.

6. Security
- Admin functions check `is_admin()` first and are executable only by signed-in users; the check itself decides access.
- Balance changes lock the player's row so concurrent changes cannot overdraw an account.
- Removing balance cannot take a player below zero.

7. Notes
- Admin accounts are granted by inserting into `admin_users` with the service role; no client path can add one.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS admin_users (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_users FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES profiles(id),
  target_id uuid NOT NULL REFERENCES profiles(id),
  action text NOT NULL CHECK (action IN ('add_balance', 'remove_balance', 'ban', 'unban')),
  amount numeric(18,2),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON admin_actions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid());
$function$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_find_user(p_zos_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_zos_id IS NULL OR p_zos_id !~ '^[0-9]{8}$' THEN
    RETURN jsonb_build_object('error', 'Enter an 8-digit ZOS ID');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE zos_id = p_zos_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'No player found with that ZOS ID');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'zos_id', v_profile.zos_id,
    'username', v_profile.username,
    'balance', v_profile.balance,
    'is_banned', v_profile.is_banned,
    'created_at', v_profile.created_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_adjust_balance(p_zos_id text, p_amount numeric, p_mode text, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target profiles%ROWTYPE;
  v_new_balance numeric(18,2);
  v_note text := NULLIF(left(btrim(COALESCE(p_note, '')), 200), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_mode IS NULL OR p_mode NOT IN ('add', 'remove') THEN
    RETURN jsonb_build_object('error', 'Invalid operation');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 1000000000 THEN
    RETURN jsonb_build_object('error', 'Amount must be between 0.01 and 1,000,000,000');
  END IF;

  IF p_zos_id IS NULL OR p_zos_id !~ '^[0-9]{8}$' THEN
    RETURN jsonb_build_object('error', 'Enter an 8-digit ZOS ID');
  END IF;

  SELECT * INTO v_target FROM profiles WHERE zos_id = p_zos_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'No player found with that ZOS ID');
  END IF;

  IF p_mode = 'add' THEN
    UPDATE profiles SET balance = balance + p_amount WHERE id = v_target.id
    RETURNING balance INTO v_new_balance;

    INSERT INTO transactions (sender_id, receiver_id, amount, type, note)
    VALUES (NULL, v_target.id, p_amount, 'adjustment', COALESCE(v_note, 'Admin credit'));

    INSERT INTO admin_actions (admin_id, target_id, action, amount, note)
    VALUES (auth.uid(), v_target.id, 'add_balance', p_amount, v_note);
  ELSE
    IF v_target.balance < p_amount THEN
      RETURN jsonb_build_object('error', 'Insufficient balance. The player has ' || v_target.balance::text || ' ₮');
    END IF;

    UPDATE profiles SET balance = balance - p_amount WHERE id = v_target.id
    RETURNING balance INTO v_new_balance;

    INSERT INTO transactions (sender_id, receiver_id, amount, type, note)
    VALUES (v_target.id, NULL, p_amount, 'adjustment', COALESCE(v_note, 'Admin debit'));

    INSERT INTO admin_actions (admin_id, target_id, action, amount, note)
    VALUES (auth.uid(), v_target.id, 'remove_balance', p_amount, v_note);
  END IF;

  RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_banned(p_zos_id text, p_banned boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_target profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_banned IS NULL THEN
    RETURN jsonb_build_object('error', 'Invalid operation');
  END IF;

  IF p_zos_id IS NULL OR p_zos_id !~ '^[0-9]{8}$' THEN
    RETURN jsonb_build_object('error', 'Enter an 8-digit ZOS ID');
  END IF;

  SELECT * INTO v_target FROM profiles WHERE zos_id = p_zos_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'No player found with that ZOS ID');
  END IF;

  IF EXISTS (SELECT 1 FROM admin_users WHERE user_id = v_target.id) THEN
    RETURN jsonb_build_object('error', 'Admin accounts cannot be banned');
  END IF;

  IF v_target.is_banned = p_banned THEN
    RETURN jsonb_build_object('success', true, 'is_banned', p_banned);
  END IF;

  UPDATE profiles SET is_banned = p_banned WHERE id = v_target.id;

  INSERT INTO admin_actions (admin_id, target_id, action)
  VALUES (auth.uid(), v_target.id, CASE WHEN p_banned THEN 'ban' ELSE 'unban' END);

  RETURN jsonb_build_object('success', true, 'is_banned', p_banned);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_recent_actions(p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_data ORDER BY row_data->>'created_at' DESC)
    FROM (
      SELECT jsonb_build_object(
        'action', a.action,
        'amount', a.amount,
        'note', a.note,
        'created_at', a.created_at,
        'admin_username', admin_p.username,
        'target_username', target_p.username,
        'target_zos_id', target_p.zos_id
      ) AS row_data
      FROM admin_actions a
      JOIN profiles admin_p ON admin_p.id = a.admin_id
      JOIN profiles target_p ON target_p.id = a.target_id
      ORDER BY a.created_at DESC
      LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
    ) recent
  ), '[]'::jsonb);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_find_user(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_adjust_balance(text, numeric, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_banned(text, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_recent_actions(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_find_user(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_balance(text, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_banned(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_recent_actions(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_zos(p_receiver_zos_id text, p_amount numeric, p_note text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
sender_record profiles%ROWTYPE;
receiver_record profiles%ROWTYPE;
new_balance numeric(18,2);
BEGIN
IF p_amount <= 0 THEN
RETURN jsonb_build_object('error', 'Amount must be greater than zero');
END IF;

SELECT * INTO sender_record FROM profiles WHERE id = auth.uid();
IF NOT FOUND THEN
RETURN jsonb_build_object('error', 'Sender profile not found');
END IF;

IF sender_record.is_banned THEN
RETURN jsonb_build_object('error', 'This account is suspended');
END IF;

SELECT * INTO receiver_record FROM profiles WHERE zos_id = p_receiver_zos_id;
IF NOT FOUND THEN
RETURN jsonb_build_object('error', 'Recipient not found');
END IF;

IF sender_record.id = receiver_record.id THEN
RETURN jsonb_build_object('error', 'Cannot send ZOS to yourself');
END IF;

IF sender_record.balance < p_amount THEN
RETURN jsonb_build_object('error', 'Insufficient balance');
END IF;

UPDATE profiles SET balance = balance - p_amount WHERE id = sender_record.id;
UPDATE profiles SET balance = balance + p_amount WHERE id = receiver_record.id;

INSERT INTO transactions (sender_id, receiver_id, amount, type, note)
VALUES (sender_record.id, receiver_record.id, p_amount, 'transfer', p_note);

new_balance := sender_record.balance - p_amount;

RETURN jsonb_build_object('success', true, 'new_balance', new_balance);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_deposit(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
user_record profiles%ROWTYPE;
today_total numeric;
new_deposit_id uuid;
BEGIN
IF p_amount <= 0 THEN
RETURN jsonb_build_object('error', 'Amount must be greater than zero');
END IF;

IF p_amount > 100000 THEN
RETURN jsonb_build_object('error', 'Maximum single deposit is 100,000 ₮');
END IF;

SELECT * INTO user_record FROM profiles WHERE id = auth.uid();
IF NOT FOUND THEN
RETURN jsonb_build_object('error', 'Profile not found');
END IF;

IF user_record.is_banned THEN
RETURN jsonb_build_object('error', 'This account is suspended');
END IF;

SELECT COALESCE(SUM(amount), 0) INTO today_total
FROM deposits
WHERE user_id = user_record.id
AND created_at >= CURRENT_DATE
AND status IN ('pending', 'confirmed');

IF today_total + p_amount > 100000 THEN
RETURN jsonb_build_object('error', 'Daily deposit limit exceeded. You have deposited ' || today_total || ' ₮ today. Maximum is 100,000 ₮ per day.');
END IF;

INSERT INTO deposits (user_id, amount, status)
VALUES (user_record.id, p_amount, 'pending')
RETURNING id INTO new_deposit_id;

RETURN jsonb_build_object('success', true, 'deposit_id', new_deposit_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_api_key(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
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

IF user_record.is_banned THEN
RETURN jsonb_build_object('valid', false, 'error', 'Account suspended');
END IF;

RETURN jsonb_build_object(
'valid', true,
'zos_id', user_record.zos_id,
'username', user_record.username,
'balance', user_record.balance,
'label', key_record.label
);
END;
$function$;

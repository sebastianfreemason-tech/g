/*
# ZOS Virtual Currency Wallet - Database Schema

## Overview
Creates the complete database backend for ZOS, a virtual currency pegged 1:1 to the Mongolian Tugrik (MNT).
Users register with a username + password, receive a random unique 8-digit ZOS ID, and can:
- Deposit ZOS via Qpay (max 100,000 ₮ per day)
- Send ZOS to other users by their 8-digit ZOS ID
- View transaction history

## New Tables

### profiles
- `id` (uuid, PK, references auth.users) — links to Supabase auth
- `username` (text, unique) — the user's chosen username
- `zos_id` (text, unique) — random 8-digit numeric ID used for transfers
- `balance` (numeric(18,2), default 0) — current ZOS balance (1 ZOS = 1 MNT)
- `created_at` (timestamptz)

### transactions
- `id` (uuid, PK)
- `sender_id` (uuid, nullable, references profiles) — null for deposits
- `receiver_id` (uuid, references profiles)
- `amount` (numeric(18,2)) — amount transferred/deposited
- `type` (text, CHECK in 'transfer','deposit')
- `note` (text, nullable) — optional message on transfers
- `created_at` (timestamptz)

### deposits
- `id` (uuid, PK)
- `user_id` (uuid, references profiles)
- `amount` (numeric(18,2))
- `status` (text, CHECK in 'pending','confirmed','failed', default 'pending')
- `qpay_transaction_id` (text, nullable)
- `created_at` (timestamptz)
- `confirmed_at` (timestamptz, nullable)

## Security
- RLS enabled on all tables.
- profiles: users can SELECT only their own row. No direct INSERT/UPDATE/DELETE — balance is only modified by SECURITY DEFINER functions.
- transactions: users can SELECT only rows where they are sender or receiver. No direct INSERT/UPDATE/DELETE.
- deposits: users can SELECT only their own deposits. No direct INSERT/UPDATE/DELETE.
- SECURITY DEFINER functions handle all mutations: send_zos, create_deposit, confirm_deposit, lookup_user_by_zos_id, get_transaction_history.
- A trigger on auth.users creates a profile with a unique random 8-digit ZOS ID on signup.

## Notes
1. Balance is a sensitive column — users CANNOT update it directly. All balance changes go through SECURITY DEFINER functions.
2. The send_zos function is atomic — debits sender, credits receiver, records transaction in one call.
3. Daily deposit limit of 100,000 ₮ is enforced server-side in create_deposit.
4. User lookup by ZOS ID returns only the username (never the balance) via lookup_user_by_zos_id.
*/

-- ============================================================
-- PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  zos_id text UNIQUE NOT NULL,
  balance numeric(18,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile"
ON profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- ============================================================
-- TRANSACTIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  type text NOT NULL CHECK (type IN ('transfer', 'deposit')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_sender ON transactions(sender_id);
CREATE INDEX IF NOT EXISTS idx_transactions_receiver ON transactions(receiver_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at DESC);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_transactions" ON transactions;
CREATE POLICY "select_own_transactions"
ON transactions FOR SELECT
TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- ============================================================
-- DEPOSITS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  qpay_transaction_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_created ON deposits(created_at DESC);

ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_deposits" ON deposits;
CREATE POLICY "select_own_deposits"
ON deposits FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- ============================================================
-- TRIGGER: Create profile on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_username text;
  new_zos_id text;
BEGIN
  -- Extract username from synthetic email (username@zos.app)
  new_username := lower(split_part(NEW.email, '@', 1));

  -- Generate unique 8-digit ZOS ID
  LOOP
    new_zos_id := lpad(floor(random() * 100000000)::text, 8, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE zos_id = new_zos_id);
  END LOOP;

  INSERT INTO profiles (id, username, zos_id)
  VALUES (NEW.id, new_username, new_zos_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- FUNCTION: Lookup user by ZOS ID (returns username only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.lookup_user_by_zos_id(p_zos_id text)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_record profiles%ROWTYPE;
BEGIN
  SELECT * INTO user_record FROM profiles WHERE zos_id = p_zos_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  RETURN jsonb_build_object('found', true, 'username', user_record.username);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Send ZOS to another user by ZOS ID
-- ============================================================
CREATE OR REPLACE FUNCTION public.send_zos(
  p_receiver_zos_id text,
  p_amount numeric,
  p_note text DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
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
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Create a deposit request (with daily limit check)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_deposit(p_amount numeric)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
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
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Confirm a deposit (credits balance)
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_deposit(p_deposit_id uuid)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deposit_record deposits%ROWTYPE;
BEGIN
  SELECT * INTO deposit_record FROM deposits WHERE id = p_deposit_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Deposit not found');
  END IF;

  IF deposit_record.user_id != auth.uid() THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  IF deposit_record.status != 'pending' THEN
    RETURN jsonb_build_object('error', 'Deposit already processed');
  END IF;

  UPDATE profiles SET balance = balance + deposit_record.amount WHERE id = deposit_record.user_id;
  UPDATE deposits SET status = 'confirmed', confirmed_at = now() WHERE id = p_deposit_id;

  INSERT INTO transactions (sender_id, receiver_id, amount, type, note)
  VALUES (NULL, deposit_record.user_id, deposit_record.amount, 'deposit', 'Qpay deposit');

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Get transaction history with usernames
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_transaction_history()
RETURNS TABLE (
  id uuid,
  sender_id uuid,
  receiver_id uuid,
  amount numeric,
  type text,
  note text,
  created_at timestamptz,
  sender_username text,
  receiver_username text,
  sender_zos_id text,
  receiver_zos_id text
)
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id, t.sender_id, t.receiver_id, t.amount, t.type, t.note, t.created_at,
    sender.username,
    receiver.username,
    sender.zos_id,
    receiver.zos_id
  FROM transactions t
  LEFT JOIN profiles sender ON sender.id = t.sender_id
  LEFT JOIN profiles receiver ON receiver.id = t.receiver_id
  WHERE t.sender_id = auth.uid() OR t.receiver_id = auth.uid()
  ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FUNCTION: Get daily deposit total for current user
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_today_deposit_total()
RETURNS numeric
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total numeric;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total
  FROM deposits
  WHERE user_id = auth.uid()
    AND created_at >= CURRENT_DATE
    AND status IN ('pending', 'confirmed');
  RETURN total;
END;
$$ LANGUAGE plpgsql;
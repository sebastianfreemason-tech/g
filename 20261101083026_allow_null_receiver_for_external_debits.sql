-- Debits have no receiving account, so receiver_id must allow NULL.
ALTER TABLE public.transactions ALTER COLUMN receiver_id DROP NOT NULL;

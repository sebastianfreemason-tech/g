-- The browser only reads profiles; balances change through the backend only.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM anon, authenticated;
REVOKE SELECT ON public.profiles FROM anon;

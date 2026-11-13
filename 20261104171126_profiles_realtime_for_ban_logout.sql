/*
# Live ban notifications

1. Realtime
- Adds `profiles` to the realtime publication so a signed-in player's browser receives changes to their own profile row.
- Delivery stays under the existing `select_own_profile` policy, so a player only ever receives their own row.
- No table grants, policies, or data change.
*/

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

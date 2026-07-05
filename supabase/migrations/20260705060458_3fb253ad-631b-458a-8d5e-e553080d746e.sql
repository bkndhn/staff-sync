-- Lock down write access to statutory_portal_config. Reads stay public
-- (config drives UI gating; nothing sensitive). Writes are restricted to
-- service_role only — the app performs admin-authenticated writes through
-- the data-api edge function which uses the service key server-side.
DROP POLICY IF EXISTS "portal cfg writable" ON public.statutory_portal_config;

-- Remove INSERT/UPDATE/DELETE privileges from anon/authenticated so even a
-- forged request through PostgREST cannot mutate the row.
REVOKE INSERT, UPDATE, DELETE ON public.statutory_portal_config FROM anon, authenticated;
# Phase 3 — `app_settings` Cutover & Rollback

First table to be moved end-to-end onto the `data-api` edge function.
Everything else still uses direct PostgREST via `supabase-js`.

## Why `app_settings` first

- Tiny table (~7 rows), read-only for most users, admin-only writes.
- Not on any Realtime channel → no subscription regressions possible.
- Cached at boot, so a temporary edge-function outage degrades gracefully.
- Zero foreign-key dependencies from other tables.

## Cutover steps

1. **Deploy `data-api`** — already live at
   `<SUPABASE_URL>/functions/v1/data-api` (see `supabase/functions/data-api/index.ts`).
2. **Flip the flag** — the client feature flag lives in
   `src/services/appSettingsService.ts`:

   ```ts
   const USE_DATA_API =
     (import.meta.env.VITE_USE_DATA_API_APP_SETTINGS ?? '1') !== '0';
   ```

   Default `1` (on). All reads and writes now route through `data-api`,
   which validates `x-session-token` against `app_sessions` and enforces
   admin-only writes.
3. **Smoke test** — Settings page → change "Default hike interval" and
   any kiosk threshold. Confirm the values round-trip and that a manager
   session cannot write (edge function returns 403).
4. **Revoke anon exposure** — after 24 h of clean logs, run:

   ```sql
   REVOKE INSERT, UPDATE, DELETE ON public.app_settings FROM anon;
   REVOKE INSERT, UPDATE, DELETE ON public.app_settings FROM authenticated;
   -- Keep SELECT for anon only if any unauth surface still needs it.
   -- The data-api function uses SUPABASE_SERVICE_ROLE_KEY, so its access
   -- is unaffected by these REVOKEs.
   ```

## Rollback (< 60 seconds)

Two independent kill switches, use whichever is faster:

### A. Client-side flag flip (no deploy)

Set `VITE_USE_DATA_API_APP_SETTINGS=0` in the environment and redeploy
the frontend. The service silently reverts to the direct `supabase-js`
path — no other file changes needed.

### B. Restore direct grants (one SQL line)

If direct access was revoked in step 4 above and the app now needs the
old path back, re-grant:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT SELECT ON public.app_settings TO anon;
```

Combine A + B for a full rollback to the pre-cutover state.

## Verification checklist

- [ ] Settings page reads all seven kiosk keys in one round-trip.
- [ ] Admin can update `default_hike_interval_months`.
- [ ] Manager session receives 403 on write, 200 on read.
- [ ] No `PGRST` errors in the console or Edge Function logs for 24 h.
- [ ] `SELECT * FROM app_sessions WHERE expires_at > now();` shows
      active sessions being validated (audit column bumps on each write).

## Next tables (in order)

`user_profiles` → `app_users` (self-only) → `attendance` → `staff`.
Each follows this exact template: add flag, smoke test, revoke, keep
rollback SQL alongside the service file.

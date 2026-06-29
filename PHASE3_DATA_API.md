# Phase 3 — Session-Validated Edge API Layer

This is the **bridge** between today's anon-key direct PostgREST access and the eventual Supabase Auth migration (Phase 4, see `AUTH_MIGRATION_PLAN.md`). It lets us revoke `anon` write/read access on individual tables **without** rewriting authentication.

## Pieces

| Layer | File | Purpose |
| --- | --- | --- |
| Edge function | `supabase/functions/data-api/index.ts` | Validates `x-session-token` against `app_sessions`, enforces a per-table role + location ACL, then proxies the query through the service-role client. |
| Client wrapper | `src/lib/dataApi.ts` | Chainable `dataApi.from('table').select()/insert()/update()/upsert()/delete()` mirroring the Supabase JS surface. Reads the token from `localStorage('sessionToken')`. |
| Config | `supabase/config.toml` | `[functions.data-api] verify_jwt = false` — auth is the session token, not a Supabase JWT. |

## How to migrate one table

1. **Swap the import in the service.** Replace `import { supabase } from '@/lib/supabase'` with `import { dataApi as supabase } from '@/lib/dataApi'` (or import both side-by-side during the transition). The query surface is identical for the common cases.
2. **Smoke-test as admin + manager + staff.** Verify the data scoping in `ACL` inside `data-api/index.ts` matches the product rules — managers must only see their own location.
3. **Once every service for that table is migrated**, run a SQL migration to revoke direct access:
   ```sql
   revoke select, insert, update, delete on public.<table> from anon;
   ```
   Leave `service_role` grants intact — the edge function uses the service role internally.
4. **Re-run the security scan** to confirm the corresponding `*_public_exposure` finding clears.

## ACL reference

The `ACL` map in `supabase/functions/data-api/index.ts` controls who can do what:

```ts
staff: { read: ['admin','manager','staff'], write: ['admin','manager'], locationCol: 'location' }
```

- `read` → roles allowed to `select`.
- `write` → roles allowed to `insert`/`update`/`upsert`/`delete`.
- `locationCol` → when present and the caller is a manager, every query is auto-filtered by `<col> = caller.location` and inserts/upserts force the column to the caller's location. Drop this for fully shared tables (e.g. `app_settings`).

When you add a new table, add it to `ACL`. Unknown tables are rejected with HTTP 403.

## Known limitations (and why Phase 4 still matters)

- Realtime subscriptions still flow through the anon key (PostgREST channel) — keep those tables readable until we cut over to Supabase Auth.
- Storage (face samples bucket) is not proxied; sign URLs from a separate edge function when you tighten that bucket.
- Complex joins and RPCs are not exposed through `data-api` yet — keep those on the direct client until needed.
- This layer is **a stop-gap**. Phase 4 (Supabase Auth + RLS by `auth.uid()`) is still the long-term destination because it covers Realtime, Storage, RPCs, and clients we don't control.

## Recommended migration order (low → high risk)

1. `app_settings`, `locations`, `designations`, `floors`, `salary_categories` (mostly read-only).
2. `leave_requests`, `advances`, `advance_entries` (staff-touched but small surface).
3. `attendance`, `punch_events`, `break_events` (hot path — migrate after the smaller tables are proven).
4. `payroll_runs`, `payroll_snapshots`, `salary_*`, `face_*` (admin-only).
5. `staff` last — touched by almost every screen.

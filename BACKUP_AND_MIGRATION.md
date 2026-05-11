# Backup & Migration Guide

This app stores everything in Supabase. The Settings → "Download Backup" button
exports a JSON snapshot of all public tables. That covers application data, but
**not** the `auth.users` table (Supabase manages it and only the service role
can read it). For full disaster recovery you need both.

---

## 1. What's in the JSON backup

The button in Settings (admin only) calls `exportFullBackup()` and downloads
`staff-mgmt-backup-<timestamp>.json` with this shape:

```jsonc
{
  "meta": { "generated_at": "...", "table_counts": { ... } },
  "data": {
    "staff": [ ... ],
    "attendance": [ ... ],
    "advances": [ ... ],
    "salary_hikes": [ ... ],
    "salary_manual_overrides": [ ... ],
    "leave_requests": [ ... ],
    "locations": [ ... ],
    "floors": [ ... ],
    "designations": [ ... ],
    "salary_categories": [ ... ],
    "app_users": [ ... ],
    "app_settings": [ ... ],
    "old_staff_records": [ ... ],
    "part_time_advance_tracking": [ ... ],
    "part_time_settlements": [ ... ],
    "face_embeddings": [ ... ],
    "face_registration_logs": [ ... ],
    "user_profiles": [ ... ]
  }
}
```

**Recommended schedule:** download monthly and keep at least 3 rolling copies in
two locations (e.g. local disk + cloud drive).

---

## 2. What this backup does NOT cover

| Item | Why | How to back it up |
|---|---|---|
| `auth.users` (login records) | Service-role only; cannot be read from the browser | `supabase db dump` (Supabase CLI) |
| Storage bucket files (`face-samples`) | Binary blobs, not in the JSON | `supabase storage` CLI or manual download |
| Edge Function code | Lives in `supabase/functions/` in this repo | Git is your backup |
| RLS policies / migrations | Lives in `supabase/migrations/` in this repo | Git is your backup |

---

## 3. Full Postgres dump (recommended for real DR)

The JSON button is for quick recovery of business data. For a true point-in-time
backup including auth, use the Supabase CLI:

```bash
# Install once
npm i -g supabase

# Auth-protected full dump (data + schema + auth)
supabase db dump --db-url "postgres://postgres.[ref]:[password]@aws-0-...pooler.supabase.com:5432/postgres" \
  --data-only -f backup-data.sql

supabase db dump --db-url "..." --schema-only -f backup-schema.sql
```

Or via `pg_dump` directly:

```bash
pg_dump "$SUPABASE_DB_URL" \
  --no-owner --no-acl \
  --exclude-schema=storage \
  --exclude-schema=realtime \
  > full-backup.sql
```

**Supabase Pro plan** also runs daily automated backups (7 days) and PITR (7-day
restore window). Enable PITR in the Supabase dashboard for production.

---

## 4. Restoring

### Restore the JSON backup (business data only)

There's a one-table-at-a-time approach. Order matters because of FKs.
Pseudocode for a restore script:

```ts
import backup from './staff-mgmt-backup-XXX.json';
import { supabase } from '../lib/supabase';

// Restore in this order
const order = [
  'locations', 'floors', 'designations', 'salary_categories', 'app_settings',
  'staff', 'app_users', 'user_profiles',
  'attendance', 'advances', 'advance_entries',
  'salary_hikes', 'salary_manual_overrides',
  'leave_requests', 'old_staff_records',
  'part_time_advance_tracking', 'part_time_settlements',
  'face_embeddings', 'face_registration_logs',
];

for (const t of order) {
  const rows = (backup as any).data[t] || [];
  if (rows.length) await supabase.from(t).upsert(rows);
}
```

Run from a Node script using the **service role key** to bypass RLS.

### Restore a Postgres dump

```bash
psql "$NEW_SUPABASE_DB_URL" < full-backup.sql
```

---

## 5. Migrating to a different Supabase / Postgres

1. Provision the new Supabase project (or any Postgres 15+ instance).
2. Run `supabase/migrations/*.sql` in chronological order on the new DB to
   create the schema.
3. Restore data: either replay the JSON backup (script above) or
   `psql < backup-data.sql`.
4. Update the front-end env vars:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_SUPABASE_PROJECT_ID`
5. Re-deploy the edge functions: `supabase functions deploy --project-ref <new-ref>`
6. Re-create the `face-samples` storage bucket (private).
7. Re-create users in the new project (Supabase doesn't transfer `auth.users`
   between projects automatically — you can either re-issue passwords via the
   Admin API or use `supabase auth migrate`).

---

## 6. Migrating to a non-Supabase Postgres (or any backend)

This app talks to Supabase via the JS SDK. To move off Supabase entirely:

1. **Database**: any Postgres works. Run the SQL migrations and restore data
   per §5.
2. **Auth**: the app currently uses Supabase Auth via `app_users` + edge
   functions (`auth-login`, `auth-create-user`). Replace with your own auth
   server (e.g. Auth0, Firebase Auth, custom JWT) and update
   `src/integrations/supabase/client.ts` + login flow.
3. **Storage** (`face-samples`): move to S3/R2/Azure Blob; update
   `faceEmbeddingService.ts` to use your provider's SDK.
4. **Edge functions**: Supabase Edge Functions are Deno + standard fetch, so
   they port easily to Cloudflare Workers, Vercel Functions, or AWS Lambda.

---

## 7. How other firms typically handle this

- **Daily DB backups** to S3/cloud storage (cron job or PITR).
- **Multi-region read replica** for hot failover.
- **Test restores quarterly** — an untested backup is not a backup.
- **Schema-in-Git, data-in-DB** — never edit production schema by hand;
  always go through migrations.
- **Separate "ops" account** for restore/restore drills (least privilege).

For this app's scale (single-org, few thousand attendance rows/month):

- Click the JSON backup button on the 1st of every month.
- Run `pg_dump` weekly via a cron VM or GitHub Action.
- Enable Supabase PITR if on Pro.
- Keep `supabase/migrations/` in Git.

That's enough resilience for a payroll/attendance system this size.

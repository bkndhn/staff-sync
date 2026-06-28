# Custom Auth → Supabase Auth Migration Plan

Target: replace `app_users` + `app_sessions` + `x-session-token` with native Supabase Auth so that RLS can gate every table by `auth.uid()` and the `authenticated` role. This closes 22 of the 25 outstanding security findings in `SECURITY_AUDIT.md`.

**Estimated effort:** 3–5 days of focused work. Do it in one branch, on a staging Supabase project, and cut over on a low-traffic Sunday.

---

## 0. Pre-flight

- [ ] Snapshot the database (Supabase Dashboard → Database → Backups).
- [ ] Snapshot the auth scheme: `select id, email, role, location, location_id from app_users;` exported to CSV.
- [ ] Decide invitation mode: **admin-invite only** (recommended for this app) vs. self-signup.
- [ ] In Supabase Dashboard → Authentication → Providers, enable **Email**, disable **Confirm email** for the cutover batch (re-enable after).
- [ ] In Authentication → URL Config, set Site URL to `https://staff-shine-sync.lovable.app` and add the preview URL to Redirect URLs.
- [ ] In Authentication → Policies, turn ON **Leaked password protection** (clears `SUPA_auth_leaked_password_protection`).
- [ ] In Project Settings → Infrastructure, schedule the **Postgres minor upgrade** (clears `SUPA_vulnerable_postgres_version`).

## 1. Schema additions (one migration)

```sql
-- 1a. Roles enum + table (per platform user-roles guide)
create type public.app_role as enum ('admin','manager','staff');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  location_id uuid references public.locations(id),
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all   on public.user_roles to service_role;

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.user_location_id(_user_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select location_id from public.user_roles where user_id = _user_id limit 1
$$;

-- 1b. Bridge column on app_users so backfill is idempotent
alter table public.app_users add column if not exists supabase_user_id uuid references auth.users(id);
```

## 2. User backfill (one edge function, run once)

Create `supabase/functions/auth-migrate-users/index.ts`:

```ts
// Iterates app_users, creates auth.users with a random password,
// stores the new id on app_users.supabase_user_id, inserts user_roles,
// and triggers a password-reset email.
const { data: users } = await supabaseAdmin.from('app_users').select('*').is('supabase_user_id', null);
for (const u of users) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: u.email,
    email_confirm: true,
    password: crypto.randomUUID(),
    user_metadata: { full_name: u.full_name, legacy_id: u.id },
  });
  if (error) { console.error(u.email, error); continue; }
  await supabaseAdmin.from('app_users').update({ supabase_user_id: data.user.id }).eq('id', u.id);
  await supabaseAdmin.from('user_roles').insert({ user_id: data.user.id, role: u.role, location_id: u.location_id });
  await supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email: u.email });
}
```

Existing bcrypt hashes are not portable — every user must reset their password. Send a single comms email beforehand.

## 3. RLS rewrite (one big migration)

For every table currently using `USING (true)` (staff, attendance, punch_events, break_events, leave_requests, advances, advance_entries, payroll_runs, payroll_snapshots, salary_hikes, salary_manual_overrides, face_embeddings, face_registration_logs, old_staff_records, part_time_advance_tracking, app_settings, locations, designations, floors, salary_categories, location_shift_config, location_designation_shift_config), apply the standard pattern:

```sql
revoke all on public.<table> from anon;
grant  select, insert, update, delete on public.<table> to authenticated;
grant  all on public.<table> to service_role;

drop policy if exists "<old name>" on public.<table>;

create policy "<table>_admin_all"    on public.<table> for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

create policy "<table>_manager_loc"  on public.<table> for all to authenticated
  using (public.has_role(auth.uid(), 'manager') and location_id = public.user_location_id(auth.uid()))
  with check (public.has_role(auth.uid(), 'manager') and location_id = public.user_location_id(auth.uid()));
```

Tables without a `location_id` column (`payroll_runs`, `app_settings`) get only the admin policy plus a manager `SELECT` policy if needed.

## 4. Storage cutover

```sql
-- face-samples bucket
delete from storage.policies where bucket_id = 'face-samples';
create policy "face_samples_admin_all" on storage.objects for all to authenticated
  using (bucket_id = 'face-samples' and public.has_role(auth.uid(), 'admin'));
create policy "face_samples_manager_read" on storage.objects for select to authenticated
  using (bucket_id = 'face-samples' and public.has_role(auth.uid(), 'manager'));
```

Kiosk no longer reads samples directly — it calls a new `face-sample-signed-url` edge function that brokers a 60-second signed URL.

## 5. Client cutover (`src/`)

1. `src/components/Login.tsx` → replace `auth-login` invoke with `supabase.auth.signInWithPassword({ email, password })`.
2. `src/App.tsx` → replace the `app_sessions` read with `supabase.auth.getSession()` and an `onAuthStateChange` listener (set up the listener **before** calling `getSession()` to avoid the documented race).
3. `src/types/index.ts` → derive `User` from `auth.users` + `user_roles` join.
4. Delete `src/utils/sessionToken.ts` (if present) and all `x-session-token` header attachments.
5. Every service in `src/services/*.ts` continues to use `supabase.from(...)` — RLS now does the gating.

## 6. Edge function cutover

For each function that today validates `x-session-token`:
- Remove the session table lookup.
- Swap to the standard `getClaims(token)` flow shown in the platform guide.
- Read role via `select role from public.user_roles where user_id = claims.sub`.

Functions to update: `auth-create-user`, `auth-update-password`, `device-pull`, `device-push` (keep its `DEVICE_PUSH_TOKEN` path — that's machine-to-machine).

## 7. QA pass

- [ ] Admin login → can see all locations on Dashboard, Staff, Attendance.
- [ ] Manager login → only own location everywhere, including face/QR kiosk.
- [ ] Kiosk page (Face Attendance) → loads with a minted service role JWT stored in `localStorage` from a dedicated `kiosk-token` edge function, scoped to one location.
- [ ] Re-run security scan → confirm 22 `*_public_exposure` findings clear.

## 8. Decommission

```sql
drop table public.app_sessions;
-- Keep app_users for 30 days as historical reference, then:
-- drop table public.app_users;
```

Remove edge functions: `auth-login`. Keep `auth-create-user` but rewrite it to call `supabase.auth.admin.createUser` instead of inserting into `app_users`.

## 9. Post-migration verification checklist

- [ ] `select count(*) from app_users where supabase_user_id is null;` → 0
- [ ] Every active user has logged in at least once with the new flow
- [ ] Security scan delta written to `SECURITY_AUDIT.md`
- [ ] `SECURITY_AUDIT.md` summary updated (ignored 25 → ignored 3, fixed 22)
- [ ] `src/data/securityFindings.json` updated to match

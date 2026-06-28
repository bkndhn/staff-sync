# Security Hardening & Auth Migration Plan

This is a large, multi-phase effort spanning documentation, UI, backend, and DevOps. I want to confirm scope and sequencing before writing code, because two of the items (Supabase Auth migration + edge-function API layer) are weeks of work that will break the app if rushed, and one (dep upgrades) needs your call on risk tolerance.

---

## Phase 1 — Deliverable now (low risk, ~1 turn)

### 1.1 Security audit report
Create `SECURITY_AUDIT.md` at repo root listing all 25 `internal_id`s from the last request with:
- Current status (all 25 are **ignored** — none code-fixable without the auth migration or vendor action)
- Scanner name
- One-paragraph justification tied to the custom-auth architecture (anon role hits Supabase; standard "authenticated only" RLS is inapplicable until Supabase Auth is in place)
- Action owner: Lovable agent / user / Supabase vendor

### 1.2 In-app Security Findings page
- New route `/security` (admin-only, gated in `Navigation.tsx`)
- New component `src/components/SecurityFindings.tsx`
- Reads findings from a new static JSON file `src/data/securityFindings.json` (seeded from the audit report — no live scan API exposed to client)
- Features: search box filtering by `internal_id` / title / scanner; status badge (Open / Ignored / Fixed); expandable row with full justification; **"Copy justification" button** per row using `navigator.clipboard`
- Admin-only via existing role gate in `App.tsx`

---

## Phase 2 — Migration plan document (no code, ~1 turn)

### 2.1 `AUTH_MIGRATION_PLAN.md`
Step-by-step plan covering:

1. **Pre-flight**: enable Supabase Auth email/password, decide whether managers self-register or admin invites
2. **User backfill script**: edge function `auth-migrate-users` that iterates `app_users`, calls `supabase.auth.admin.createUser({ email, email_confirm: true })`, and stores the new `auth.users.id` on `app_users.supabase_user_id`. Issue password-reset emails (existing bcrypt hashes aren't portable)
3. **Profile bridge**: add `user_profiles` row keyed by `auth.users.id`, copy role + location
4. **Role storage**: ensure `user_roles` table + `has_role()` SECURITY DEFINER function exists (per platform user-roles guide)
5. **RLS rewrite per table** (staff, attendance, punch_events, breaks, leave_requests, advances, payroll_*, salary_*, face_*, locations_device_config): policies use `auth.uid()` + `has_role()` + location-scoped manager rule
6. **GRANT changes**: revoke from `anon`, grant to `authenticated`
7. **Client cutover**: replace custom `Login.tsx` flow with `supabase.auth.signInWithPassword`; replace `app_sessions` token plumbing with `supabase.auth.getSession()`
8. **Edge function cutover**: every function switches from `x-session-token` validation to `getClaims()`
9. **Decommission**: drop `app_sessions`; archive `app_users` (keep 30 days); remove `auth-login`/`auth-create-user` functions
10. **Verification checklist**: re-run security scan, expect public_exposure findings to clear

---

## Phase 3 — Edge-function API layer (high effort, needs your go-ahead)

Goal: stop the browser from talking to Postgres directly for sensitive tables, so we can revoke `anon` grants without waiting for the full auth migration.

### 3.1 New shared helper
`supabase/functions/_shared/session.ts` — validates `x-session-token` against `app_sessions` and returns `{ userId, role, locationId }`. Used by every protected function.

### 3.2 New edge functions (one per resource)
- `staff-api` (GET list/get, POST create, PATCH update, DELETE)
- `attendance-api`
- `punch-events-api`
- `breaks-api`
- `leave-api`
- `advances-api`
- `payroll-api`
- `salary-api`
- `face-api`

Each function:
- Validates session
- Enforces role: admin = all locations; manager = own `location_id` only
- Uses `supabaseAdmin` (service role) internally for the actual DB call
- Returns sanitized rows

### 3.3 Client refactor
Rewrite every service in `src/services/*` to call `supabase.functions.invoke('<resource>-api', ...)` instead of `supabase.from('<table>')`.

### 3.4 Lock down database
Migration that `REVOKE ALL ... FROM anon` on all sensitive tables, leaves `SELECT` only on truly public ones.

**Reality check**: this is ~25-30 service files and ~9 edge functions of work — a multi-day effort. If we do this *and then* the full auth migration in Phase 2, we'll be redoing it. **Recommendation**: skip Phase 3 and go straight to Phase 2 (Supabase Auth + RLS), which solves the same problem in a way the platform supports natively.

---

## Phase 4 — Dependency upgrade workflow

### 4.1 GitHub Action `.github/workflows/security-upgrades.yml`
- Weekly cron + manual dispatch
- Runs `bun audit --json`, uploads as artifact
- Runs `bunx npm-check-updates -u --target minor` for minor/patch bumps only
- Runs `bun install && bun run build` to verify
- Opens PR with the changes (uses `peter-evans/create-pull-request`)
- Major bumps stay manual to avoid breaking changes

### 4.2 Re-run security scan
After upgrades land, call the scanner and write a delta report to `SECURITY_AUDIT.md` (`## Scan Delta YYYY-MM-DD` section).

**Caveat**: I can write the workflow, but I cannot merge PRs or wait a week for cron. The first run only happens once you push to GitHub. I can run `bun audit` + targeted upgrades **right now** in-sandbox as a one-shot, then commit the workflow for ongoing runs.

---

## Questions before I proceed

1. **Phase 3**: do you want the edge-function API layer (weeks of churn, throwaway work) **or** skip it and jump to Phase 2 Supabase Auth migration?
2. **Phase 2 execution**: do you want me to start *implementing* the migration in this same task, or only deliver the `AUTH_MIGRATION_PLAN.md` document for review first? (Implementing it touches every screen.)
3. **Phase 4 immediate run**: should I run `bun audit` + minor/patch upgrades right now as part of this task, or only commit the workflow?
4. **In-app Security page**: admin-only, or should managers also see it (read-only)?

Once you answer, I'll execute. If you want me to just "do everything sensible", I'll: ship Phase 1 + Phase 2 doc + Phase 4 workflow + immediate dep upgrade run, and **defer** Phase 3 in favor of the real auth migration.

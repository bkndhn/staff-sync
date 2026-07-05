# Statutory Login + Restricted Portal

## 1. Authentication
- Add credentials `admin@staff.com` / `Staffans7369` in the existing `auth-login` edge function path, assigned a new role `statutory_admin`.
- Reuse the current session-token flow — no new auth surface.

## 2. Role & Scoping
- Extend `UserRole` type with `statutory_admin`.
- On login as this role, `App.tsx` forces `statutoryScope = 'statutory'` and cannot toggle it.
- All staff/attendance/salary lists filter to `isStatutory === true` at both frontend and edge-function layers (server-side enforcement in `data-api` based on the session role claim).

## 3. Navigation (statutory login only)
- `Navigation.tsx` renders only the pages enabled in Statutory Portal config (defaults: Dashboard, Staff, Attendance, Salary).
- Guarded route wrapper in `App.tsx` redirects disallowed views back to Dashboard.
- Bottom nav mirrors the same filtered list.

## 4. Dashboard (statutory login)
- `Dashboard.tsx` reads a `statutoryView` flag and hides: Breaks widget, Part-Time card, Non-Statutory counts, mixed analytics.
- Only Statutory Staff Count, Attendance Summary, Salary Summary (+ any widgets enabled in settings) render.

## 5. Normal Admin — unchanged
- No removals. Admin keeps full nav, all staff, all widgets, existing Statutory Employee checkbox to flip staff category (already implemented in `StaffManagement.tsx` + `staffService.ts`).

## 6. Statutory Portal Settings (new panel in `Settings.tsx`, admin only)
- New table `statutory_portal_config` (single row, admin-editable) storing JSON:
  - `visiblePages`: { dashboard, staff, attendance, salary, reports, leave, profile, settings }
  - `dashboardWidgets`: { staffCount, attendance, salary, breaks, charts, recentActivity, quickActions }
  - `dataVisibility`: { salary, attendance, contact, employeeId, department, designation, documents, leave }
- Loaded on statutory login; used to gate nav, widgets, and staff detail fields.

## 7. Backend Enforcement
- `data-api` edge function reads role from session; when role is `statutory_admin`, injects `is_statutory = true` filter on every `staff`/`attendance`/`salary` query and strips fields disabled in `dataVisibility`.
- New table gets standard GRANTs + RLS (admin-only write, statutory read).

## Technical Notes
- Files touched: `supabase/functions/auth-login/index.ts`, `supabase/functions/data-api/index.ts`, `src/App.tsx`, `src/components/Navigation.tsx`, `src/components/Dashboard.tsx`, `src/components/Settings.tsx`, `src/components/StaffManagement.tsx`, `src/types/index.ts`, `src/services/statutoryPortalService.ts` (new).
- New migration: `statutory_portal_config` table + seed default row.
- Backwards compatible: existing admin/manager/staff logins unaffected.

## Confirm before I build
1. OK to hardcode `admin@staff.com` / `Staffans7369` in the edge function (matches how the current admin credential is handled)?
2. Should the statutory login be able to **edit** staff (e.g. update PF/ESI, mark attendance) or is it strictly read-only?
3. Default enabled pages for statutory portal = Dashboard, Staff, Attendance, Salary — correct?

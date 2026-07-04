## Goal

Fold statutory compliance into the main admin experience. One login, no separate portal. The four operational pages default to showing only statutory employees; admin can flip a toggle to see everyone.

## Changes

### 1. Login & role cleanup
- Remove the **Statutory** tab and hardcoded `statutory / Comply@2026` credential from `src/components/Login.tsx`. Login goes back to **Admin/Mgr** + **Staff** only.
- Drop the `'statutory'` branch from `src/App.tsx` (role short-circuit, default tab, `validForRole`) and delete the lazy `StatutoryDashboard` import + render.
- Remove `'statutory'` from the `User['role']` union in `src/types/index.ts`.
- `src/components/StatutoryDashboard.tsx` stays on disk but is unreferenced (kept in case we want to re-mount it as a report later; no build cost since it's lazy-loaded and now un-imported).

### 2. Schema — `is_statutory` flag on staff
- Migration adds `is_statutory boolean not null default false` on `public.staff`.
- Backfill: any existing full-time staff that already has a `pf_number` or `esi_number` gets `is_statutory = true` (best-effort so the app isn't empty on first load).
- Add `isStatutory?: boolean` to `Staff` in `src/types/index.ts`, and map it in `staffService.mapFromDatabase` / `mapToDatabase`.

### 3. Staff form — Statutory Employee checkbox
- In `src/components/StaffManagement.tsx` Add/Edit modal, add a **Statutory Employee** checkbox near the top of the form.
- Existing PF number, ESI number, and statutory-deductions fields are moved into a conditional block that only renders when the checkbox is checked. When unchecked those fields are cleared on save.

### 4. Global Statutory-only filter (admin-controlled)
- New app-level state in `src/App.tsx`: `statutoryScope: 'statutory' | 'all'`, persisted in `localStorage.statutoryScope`, default `'statutory'`.
- New header control in `src/components/Navigation.tsx` visible to admin/manager: a small pill toggle **"Statutory only / All staff"**. Flipping it updates the shared state.
- Four pages receive a pre-filtered `staff` list based on the toggle:
  - `Dashboard` — cards, charts, tables scoped to filtered staff.
  - `StaffManagement` — list respects the toggle. Adding a new staff still defaults `isStatutory=false`; user checks the box if applicable.
  - `Attendance` — staff selector + rows filtered.
  - `SalaryManagement` — payroll list filtered; stat totals still work over the visible slice.
- Attendance and Salary computations themselves are untouched — we only narrow the staff set passed in.

### 5. Small cleanups
- Delete the "Statutory" nav tab constant (`'Statutory Dashboard'`) from `NavigationTab`.
- Remove statutory copy on the Login screen and the third-tab CSS grid (back to two columns).

## Out of scope for this pass
- No changes to statutory calculation logic in `src/utils/statutoryDeductions.ts` — same PF/ESI math.
- No separate downloadable "compliance report" button beyond the existing Salary export; can be layered in a follow-up if needed.
- The abandoned `StatutoryDashboard.tsx` file is left in place, not deleted, so we can resurrect its report UI as an admin action later.

## Technical notes

- `is_statutory` migration is a pure `ALTER TABLE ADD COLUMN` on `public.staff`; existing GRANTs and RLS from the prior lockdown are preserved.
- The scope toggle lives in `App.tsx` state and is passed down as a prop to the four pages, so no context provider needed.
- The Staff form checkbox writes `isStatutory` through the existing `staffService.update` / `create` path (already routed through the session-validated `data-api`).

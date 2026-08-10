# Plan: Smooth Onboarding + World-Class HR Features + Test Coverage

Sequenced into 3 phases. Each phase is independently shippable.

---

## Phase 1 — Smooth Client Onboarding (Super Admin + Admin first-run)

**Goal:** A new client created in the Super Admin console lands in a guided setup instead of a blank dashboard, and the Super Admin can see each client's setup progress.

### 1a. Super Admin — onboarding-progress checklist per client
- New `get_tenant_onboarding_status` query (edge function `super-admin`, new action `tenant_onboarding`) that checks: locations configured? ≥1 floor? designations set? shift rules set? salary categories set? ≥1 staff imported? first attendance marked? first payroll run?
- `SuperAdminConsole.tsx` (already has `wizardStep` state): add a small progress bar + checklist chips under each client card showing which setup steps are complete. Red flag if a client has been active >7 days with 0 staff.

### 1b. Tenant-create wizard — pre-seed starter templates
- Extend `create_tenant` in `super-admin/index.ts` to accept a `template` payload (`retail` | `restaurant` | `manufacturing` | `custom`). On create, seed: 3-4 default designations, 2-3 break types, a default location_shift_config, and default salary categories from a template map (hardcoded in the edge function).
- Add a template picker (cards) as step 0 of the existing create wizard in `SuperAdminConsole.tsx`.

### 1c. Admin first-run guided wizard
- New `OnboardingWizard.tsx` component shown when an admin logs in and `app_settings.onboarding_complete` is false.
- Steps: (1) Add first location, (2) Add floors, (3) Add designations, (4) Set shift rules, (5) Import staff (CSV paste or form), (6) Done → set `onboarding_complete = true`.
- Each step reuses existing services (`locationService`, `floorService`, `designationService`, `locationShiftService`, `staffService`) — no new APIs.
- Reuses the existing `BulkStaffUpload.tsx` logic for the staff-import step.
- Skip button for admins who want to configure manually; accessible later from Settings.

### 1d. In-product first-login tour (lightweight)
- A small `CoachmarkTour.tsx` overlay that highlights Staff → Attendance → Salary on first admin login (also gated on `onboarding_complete` first becoming true). Dismissible, stored in localStorage.

**Files:** `SuperAdminConsole.tsx`, new `OnboardingWizard.tsx`, new `CoachmarkTour.tsx`, `super-admin/index.ts`, `appSettingsService.ts`, `App.tsx` (render wizard conditionally).

---

## Phase 2 — World-Class HR Features

### 2a. Payslip distribution automation
- New edge function action `distribute_payslips` in `data-api` that, for a payroll run, generates per-staff payslip PDFs (reuse `pdfExport.ts` logic server-side isn't feasible; instead generate client-side and send) — **client-side orchestration**: `BulkSalarySender.tsx` already exists; enhance it to generate payslip PDFs per staff and queue them via WhatsApp deep link / share, with a delivery log table `payslip_distributions` (status: pending/sent/failed, sent_at).
- Add a "Distribute Payslips" button on the payroll run summary in `SalaryManagement.tsx` with progress UI.

### 2b. Attendance regularization workflow
- New table `attendance_regularizations` (staff_id, date, requested_in/out, reason, status, approval levels) — mirrors the existing `leave_requests` multi-level approval pattern (`workflow_configs`).
- Staff request a missing-punch correction from `StaffPortal.tsx`; manager/admin approves via `AttendanceTracker.tsx` (new "Regularizations" tab). On approval, writes corrected punch_events.
- Server-side authorization reuses `loanPolicy.ts` threshold pattern.

### 2c. Payroll analytics dashboard
- New `PayrollAnalytics.tsx` widget/page: month-over-month total cost line chart, location-wise cost bar chart, gross→net waterfall for selected month (reuses `reconcileSalary` from `salaryValidation.ts`), attrition cost.
- Lightweight charting via inline SVG/divs (no new heavy dependency) or add `recharts` if acceptable.
- Added as a Dashboard widget + a standalone tab under Salary.

**Files:** new `payslip_distributions` table + migration, `BulkSalarySender.tsx`, `SalaryManagement.tsx`, new `attendance_regularizations` table + migration, `StaffPortal.tsx`, `AttendanceTracker.tsx`, new `PayrollAnalytics.tsx`, `Dashboard.tsx`.

---

## Phase 3 — Test Coverage (Playwright E2E)

**Goal:** De-risk the 50k-LOC app with a repeatable E2E suite. Project already has `playwright.config.ts` and 2 visual specs.

### 3a. Auth & role flows
- Login as admin / statutory_admin / supervisor / staff portal; assert each sees the correct nav items and is blocked from others.

### 3b. Core data round-trips
- Add staff → mark attendance → generate salary → reconcile gross/net → assert no validation errors (uses `reconcileSalary`).
- Loan request → approval → EMI deduction appears in advances.

### 3c. Multi-tenant isolation
- Log in as client A admin, confirm cannot see client B staff/attendance (assert zero rows or 403).

### 3d. Super admin console
- Create client with `retail` template → assert seeded designations/shift config exist → suspend → reactivate.

New specs under `tests/e2e/`. Run via `lovable-exec test` / `bunx playwright run`.

---

## Sequencing & credits

Phases are ordered by impact-per-credit: onboarding (Phase 1) is the biggest "smoothness" win and is mostly frontend; Phase 2 adds the most user-facing feature value; Phase 3 protects everything else. I'll build Phase 1 fully first, pause for your review, then proceed to Phase 2 and 3.

No schema changes are required for Phase 1 except an `onboarding_complete` flag on `app_settings` (existing jsonb `statutory_login_details`-style column can hold it, or a new boolean). Phase 2 adds 2 tables. Phase 3 adds test files only.

---

## Open question (does not block Phase 1)

- Charting library: can I add `recharts` (~50kb) for the payroll analytics charts, or keep it dependency-free with inline SVG? Default if no answer: inline SVG to avoid a new dependency.

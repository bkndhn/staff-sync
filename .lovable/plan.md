# Break Management — Implementation Plan

A complete Break Management module integrated with Attendance, Payroll, Shift, Biometric Sync, and Dashboard.

## 1. Database (Supabase migration)

**New tables**
- `break_types` — id, name, code (`lunch` | `tea` | `custom`), default_minutes, max_minutes, is_paid, is_active, sort_order
- `break_events` — id, staff_id, staff_name, location, date, break_type_id, start_time, end_time, duration_minutes (generated), source (`web`|`mobile`|`biometric`|`manual`), device_label, is_violation, violation_reason, notes, created_by, created_at, updated_at
- `break_policies` — id, location, designation_id (nullable), break_type_id, max_per_day, max_minutes_per_break, max_total_minutes_per_day, deduct_from_hours (bool), grace_minutes

**Extends**
- `attendance` → add `break_minutes int default 0`, `net_working_minutes int`
- `punch_events.kind` accept `break_in` / `break_out` (no schema change — `kind` is text)

RLS: admin full, manager scoped to their location, staff read own + insert own break for self.
Seed: Lunch (30m, paid=false), Tea (15m, paid=true), Custom (paid=true).

## 2. Services (`src/services/`)
- `breakTypeService.ts` — CRUD
- `breakPolicyService.ts` — CRUD + resolve(staff)
- `breakEventService.ts` — start/end/list/upsert/delete + violation evaluator + offline-queue (mirror `punchEventService`)

## 3. UI Components
- `BreakControls.tsx` — Start/End buttons with break-type picker (used inside StaffPortal, FaceAttendance, QRAttendanceScanner)
- `BreakManager.tsx` (Admin/HR) — table with filters (date, location, staff, type), inline edit/add/delete, export CSV/PDF
- `BreakTypesSettings.tsx` + `BreakPoliciesSettings.tsx` in Settings
- Dashboard widget `BreaksToday.tsx`: on-break-now list, total break minutes, avg duration, violation count
- `BreakReports.tsx` — by employee / location / date range, with charts

## 4. Integrations
- **Biometric / device-push edge function**: map device punch codes (configurable per device) to `break_in` / `break_out`, insert into `punch_events` and `break_events`
- **Local bridge agent**: same mapping; pulls break punches from eSSL/ZKTeco "function key" events
- **Attendance calc** (`salaryCalculations.ts` + `AttendanceTracker`): subtract unpaid break minutes from working hours; expose break columns
- **Payroll**: late deduction logic already exists — extend to include "exceeded break minutes" as configurable deduction

## 5. Alerts & Audit
- Toast + dashboard banner when break exceeds policy or end-of-shift reached with open break (auto-close + flag violation)
- All add/edit/delete writes to existing `audit_logs` via `auditLogService`

## 6. Role-based permissions
- Admin: full
- Manager: full within own location(s)
- Staff: start/end own break only; read own history

## 7. Files to create / edit

```text
NEW  supabase/migrations/<ts>_break_management.sql
NEW  src/services/breakTypeService.ts
NEW  src/services/breakPolicyService.ts
NEW  src/services/breakEventService.ts
NEW  src/components/BreakControls.tsx
NEW  src/components/BreakManager.tsx
NEW  src/components/BreakTypesSettings.tsx
NEW  src/components/BreakPoliciesSettings.tsx
NEW  src/components/BreakReports.tsx
NEW  src/components/dashboard/BreaksToday.tsx
EDIT src/components/StaffPortal.tsx          (add BreakControls)
EDIT src/components/FaceAttendance.tsx       (break mode)
EDIT src/components/QRAttendanceScanner.tsx  (break mode)
EDIT src/components/AttendanceTracker.tsx    (break col + net hours)
EDIT src/components/Dashboard.tsx            (BreaksToday widget)
EDIT src/components/Settings.tsx             (break types/policies tabs)
EDIT src/components/Navigation.tsx + App.tsx (Break Manager route)
EDIT src/utils/salaryCalculations.ts         (subtract unpaid breaks)
EDIT supabase/functions/device-push/index.ts (break_in/out mapping)
EDIT local-bridge-agent/index.js             (break code mapping)
EDIT src/types/index.ts                      (BreakType, BreakEvent, BreakPolicy)
```

## 8. Rollout order
1. Migration + seed + types
2. Services + offline queue
3. Staff-facing BreakControls (web/mobile)
4. Admin BreakManager + Settings
5. Attendance/payroll integration
6. Device-push + bridge mapping
7. Dashboard widget + reports + alerts
8. Audit + RBAC verification

This is a large module (~15 new files, ~10 edits, 1 migration). Approve and I'll build it end-to-end in this task.

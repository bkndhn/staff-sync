## Scope

Seven related changes across the staff portal, attendance logic, and admin settings.

---

### 1. Staff Portal layout & cards
- Make Monthly and Yearly tabs use full page width (remove the centered container max-width on those tabs).
- Move the "Year 2026 attendance" summary card so it shows ONLY in the Yearly tab, not Monthly.
- In the Monthly tab attendance view, add an **Uninformed leave card** in the summary row and add a column **"UI"** in the daily attendance table that shows ✓ when `is_uninformed` is true.

Files: `src/components/StaffPortal.tsx` (and any sub-views it uses for Monthly/Yearly).

---

### 2. PF & ESI numbers per staff
- Add `pf_number TEXT` and `esi_number TEXT` columns on `staff` (nullable).
- Add input fields in Staff add/edit form (Settings/Staff Management).
- Show in Staff Portal Overview tab — only render the row if value is set (per your preference).

Files: migration + `StaffManagement.tsx`, `StaffPortal.tsx`, `types/index.ts`, `staffService.ts`.

---

### 3. Auto half/full day detection (with per-staff & global shift windows)

**Defaults** (configurable):
- `morning_start` 10:00, `midday_cutoff` 15:00, `full_day_min_out` 21:30
- Min work duration: 4 hours

**Rules** when a punch-out is recorded:
- IN before midday_cutoff AND OUT ≥ full_day_min_out → **Full Day**
- IN before midday_cutoff AND OUT < full_day_min_out → **Half Day**
- IN ≥ midday_cutoff (afternoon punch-in) → **Half Day**
- If only IN is recorded by end of day (no OUT) → assume Full Day (your "can't tell, assume full" rule)

**Override hierarchy** (most specific wins):
1. Per-staff `shift_window` JSON on `staff` table (already exists — extend its shape to `{ morning_start, midday_cutoff, full_day_min_out, min_work_minutes }`)
2. Global defaults stored in `app_settings` under key `shift_windows_global`
3. Hardcoded fallback above

Manager/admin can manually override the auto-computed status from the attendance UI (existing behavior preserved).

Files: `src/utils/salaryCalculations.ts` (or new `src/utils/shiftRules.ts`), `FaceAttendance.tsx`, `AttendanceTracker.tsx`, `ShiftWindowsPanel.tsx` (extend), `Settings.tsx`.

---

### 4. Punch-out safeguards
- Block punch-out if elapsed time since punch-in < `min_work_minutes` (default 240 = 4 hours).
- Show a clear message: "You can't punch out yet. Worked X min, minimum is 240 min. Contact your manager for emergency override."
- Manager/admin override: a dialog with reason that bypasses the check (logged in attendance notes / `is_uninformed` style flag).

Files: `FaceAttendance.tsx`, `AttendanceTracker.tsx`.

---

### 5. Dashboard punch times display
- For each staff card on Dashboard, show today's IN/OUT formatted as 12-hour am/pm:
  `BAKRUDHEEN (IN-10:00 am  OUT-8:45 pm)`
- If no OUT yet: `OUT-—`. If no attendance: hide the line.

Files: `src/components/Dashboard.tsx`.

---

### 6. Face capture/attendance accuracy
- Increase descriptor sample count required for registration (e.g. require 3 angles minimum already exists — raise quality threshold).
- Lower distance threshold for match from default to a stricter value (e.g. 0.45 → 0.40) to reduce false positives.
- Add brightness/blur quality gate before accepting a capture.
- Average descriptor across multiple frames at recognition time (3 consecutive frames must all match).

Files: `src/hooks/useFaceApi.ts`, `FaceAttendance.tsx`, `FaceRegistration.tsx`.

---

### 7. App "logs out / blank" intermittently
Likely cause: the cached `app_session` token in localStorage is getting cleared/expired and the app renders blank instead of redirecting to login. I'll:
- Add a session validity check on mount with graceful redirect to login (instead of blank).
- Add an error boundary on the root that recovers gracefully.
- Auto-refresh session if expires_at is within 24h.

Files: `src/App.tsx`, `src/services/userService.ts`, `src/components/Login.tsx`.

---

### Database migration

```sql
ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS pf_number TEXT,
  ADD COLUMN IF NOT EXISTS esi_number TEXT;

-- shift_window already exists on staff; we'll just use a richer JSON shape.
-- Global defaults stored as a single row in app_settings (key='shift_windows_global').
```

No data destruction. RLS unchanged.

---

### Admin UI: Shift Windows & Auto Half-Day Rules
Extend `ShiftWindowsPanel.tsx`:
- Top section: **Global defaults** (morning_start, midday_cutoff, full_day_min_out, min_work_minutes).
- Below: per-staff override table (already partly there) with the same 4 fields.

---

### Out of scope (will not change)
- Salary calculation formulas themselves.
- Existing attendance status enum values.
- Auth/role model.

---

### Order of execution
1. Migration (PF/ESI columns)
2. Shift rules utility + types
3. Settings UI (global + per-staff)
4. Attendance logic (auto detect + min-work guard)
5. Dashboard punch time display
6. StaffPortal layout, cards, PF/ESI display
7. Face accuracy improvements
8. Session blank-screen fix

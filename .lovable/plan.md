# Plan

Three batches, delivered in order. Each ends in a working, verifiable state.

---

## Batch 1 — Statutory disguise (admin UI + hide extras)

Goal: a statutory admin login is visually indistinguishable from a regular admin. Data is still silently filtered to statutory staff. Extend `roleVisibility.ts` with a single helper `isDisguisedAdmin(role)` so every gate lives in one file.

**Removals (statutory-only UI hints):**

1. `SalaryManagement.tsx`
   - Remove the entire "Statutory Export" dropdown (lines ~1055-1069) when `hideStatutoryExtras(userRole)` is true.
   - Rename the "ESI/PF/Statutory" column header to "Deductions".
   - Keep ESI/PF summary cards (they exist for regular admins too), but drop the "STAT" chip on the third card (line ~1298).

2. `Navigation.tsx`
   - Remove the mobile "STAT / ALL" toggle button (lines 193-205) for statutory admins (it's already no-op, but visible).
   - Confirm nav label already says "Administrator" (done last turn).

3. `StaffManagement.tsx`
   - Hide the "Statutory Employee" checkbox and the entire statutory-deductions editor block when `hideStatutoryExtras(role)` — statutory admins shouldn't see the concept named.
   - Any filter chip that says "Statutory" → hide.

4. Grep sweep: any remaining visible string containing "Statutory" (buttons, badges, section titles, tooltips) gated behind `hideStatutoryExtras`. Preserve internal identifiers (`isStatutory`, `statutoryBreakdown`) — those are data, not UI.

**Wiring:** thread `userRole` where missing (Staff, Attendance already have it; Salary already has it).

---

## Batch 2 — Face page: full mobile-native feel

Goal: on phones, the Face page behaves like a native camera app, not a scaled-down desktop dashboard.

Changes to `FaceAttendance.tsx` + `FaceRegistration.tsx` + one new file `src/components/face/MobileFaceShell.tsx`:

1. **Fullscreen camera mode on mobile** — camera preview fills the viewport (`100dvh`), UI floats on top as translucent overlays. Desktop layout untouched.
2. **Bottom sheet for controls** — new lightweight sheet component (no library) with drag handle, snap points (peek / half / full). Holds: staff picker, sensitivity, threshold, mode toggle (recognize/register), history.
3. **Sticky action bar** — the primary CTA (Capture / Confirm Attendance) pinned above the sheet, always thumb-reachable.
4. **Swipeable tab strip** — Recognize | Register | History as swipeable tabs with `touch-pan-x` + snap scroll (CSS scroll-snap, no lib).
5. **Haptics** — `navigator.vibrate([15])` on match, `[30,50,30]` on error. Gated behind capability check.
6. **Gestures** — pinch-to-zoom on the video element (CSS `touch-action` + a small `useTouchZoom` hook); double-tap to switch camera.
7. **Reduced chrome on mobile** — hide desktop-only side panels behind the sheet.
8. **Perf carryover** — keep the throttled detect loop and 320-input from last turn; add `will-change: transform` on the overlay canvas.

Desktop layout stays as-is (guarded by `md:` breakpoints). No visual regression on desktop verified via Playwright screenshot.

---

## Batch 3 — Staff table → ResponsiveTable

Goal: `StaffManagement.tsx` table renders as cards on `<md`, staying keyboard-friendly and fast.

1. Extract row cells into a `renderStaffRow(staff)` and `renderStaffCard(staff)` shared by `ResponsiveTable`.
2. Preserve sorting, filters, bulk selection, and inline actions in both modes.
3. Sticky filter/search bar on mobile, sticky bulk-action footer when rows are selected.
4. Employee Code still gated by `canSeeEmployeeCode` in both table and card renderers.

---

## Verification

- `bun run build` clean.
- Playwright: log in as `statutory_admin` → screenshot Dashboard, Salary, Staff, Attendance → visually confirm no "Statutory" wording, no Stat Export button, no STAT chip.
- Playwright mobile viewport (390×844): screenshot Face page → confirm fullscreen camera + bottom sheet + sticky CTA; screenshot Staff page → confirm cards render.
- Keyboard tab-order sanity on Staff cards.

---

## Non-goals

- No data-model changes. `isStatutory`, filtering logic, RLS untouched.
- No new npm libraries (bottom sheet + swipe tabs written in-house, ~150 LOC).
- No desktop redesign.

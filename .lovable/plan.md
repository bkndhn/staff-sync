# Remaining Work — 3 Sequential Batches

I'll ship these in order so each batch is testable on its own before moving to the next.

---

## Batch 1 — Face page UX polish (skeletons / empty / error states)

Scope: `src/components/FaceAttendance.tsx`, `src/components/FaceRegistration.tsx`

- Add a shared `<Skeleton>` primitive (`src/components/ui/Skeleton.tsx`) with pulse animation using existing design tokens (no hardcoded colors).
- Replace the current "Loading…" text on Face page with skeleton rows for: model loading, staff list, embeddings list, recent-recognitions list.
- Add explicit empty states with an icon + short helper text:
  - "No faces enrolled yet — open Face Registration to add samples"
  - "No recognitions today — point the camera at an enrolled staff"
  - "No matching staff at this location"
- Add clear error banners (red tint, retry button) for: model download failure, camera permission denied, embeddings fetch failure, network offline.
- Wrap FaceAttendance in the existing `<ErrorBoundary moduleName="Face Attendance">` so a crash doesn't blank the screen.

## Batch 2 — Face page mobile perf + profiling

- Add a tiny in-app profiler (`src/lib/perfProfiler.ts`): wraps `performance.mark` / `performance.measure`, dumps a small overlay when `?perf=1` is in the URL. Records: model-load ms, first-frame ms, avg detect ms, avg match ms, JS heap.
- Instrument key steps in `useFaceEngine` and `FaceAttendance` (detect loop, embedding compare, DB write).
- Perf wins targeted at mobile:
  - Drop `inputSize` from 608 → 320 on devices with `navigator.hardwareConcurrency <= 4` or `deviceMemory <= 4` (keeps 608 on desktop).
  - Throttle detect loop to `requestAnimationFrame` + min 150ms gap on mobile (currently runs as fast as possible).
  - Downscale the video frame to 480px wide before passing to face-api (huge speedup, negligible accuracy loss for close-up kiosk use).
  - Lazy-load the ONNX detector only after first successful SSD detection (don't preload on mobile).
  - Skip landmark computation for the "match-only" path once a face is locked.
- Add a small "Perf" chip visible only when `?perf=1` shows live FPS + last detect ms.

## Batch 3 — App-wide mobile responsive pass

Rather than touch every file, I'll introduce reusable patterns and apply them to the highest-traffic pages first:

- Table → card pattern: add `src/components/ui/ResponsiveTable.tsx` that renders `<table>` on `md+` and stacked cards on mobile. Migrate: StaffManagement, SalaryManagement, AttendanceTracker daily view, LeaveManagement.
- Fluid typography: audit `text-xs`/`text-[10px]` in top-bar and dialogs; bump to `text-sm` on `<sm` breakpoints.
- Tighten paddings: replace fixed `p-6` with `p-3 md:p-6` on page shells.
- Sticky action bars on mobile (Save/Cancel float at bottom instead of scrolling out of view) for Salary edit rows and Staff modal.
- Verify CustomDialog is full-width on small screens (currently max-w might overflow).
- Add a manual mobile checklist to `docs/MOBILE_RESPONSIVE_CHECKLIST.md`.

---

## Technical notes

- No business-logic changes — presentation, loading states, and perf only.
- No new dependencies. Skeleton and profiler are ~50 lines each, hand-written.
- All colors from `index.css` tokens; no `text-white` / `bg-black` literals.
- Statutory column-visibility rules from previous work are respected in the new ResponsiveTable cards.

## Order of delivery

1. Batch 1 (Face UX) — smallest, immediately visible improvement.
2. Batch 2 (Face perf) — measurable via the new `?perf=1` overlay.
3. Batch 3 (mobile pass) — largest; I'll ship page-by-page and pause between the top-traffic pages so you can review.

Approve and I'll start with Batch 1.

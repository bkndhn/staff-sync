# Mobile Responsive Checklist

Verify every page against this list before shipping any UI change.

## Layout
- [ ] No horizontal scroll on 360px width.
- [ ] Page padding uses `p-3 md:p-6` (not fixed `p-6`).
- [ ] Cards/rows stack vertically on `<md`; tables convert to `ResponsiveTable`.
- [ ] Sticky top bar does not overlap page content.

## Typography
- [ ] Body text is at least `text-sm` (14px) on `<sm`.
- [ ] Avoid `text-[10px]` / `text-[11px]` for anything a user must read.
- [ ] Line-height comfortable; no clipped ascenders/descenders.

## Controls
- [ ] Buttons ≥ 44×44 px touch target on mobile.
- [ ] Primary action visible without scrolling (sticky bottom bar for long forms).
- [ ] Inputs use `text-base` on mobile to prevent iOS zoom-on-focus.
- [ ] Modals (`CustomDialog`) fit within `100vw - 24px`.

## Data
- [ ] Long lists virtualise or paginate (>200 rows).
- [ ] Empty states have icon + one-line explanation + optional CTA.
- [ ] Loading states use `<Skeleton>` / `<SkeletonList>` — never bare "Loading…".
- [ ] Errors show retry, not a dead-end alert.

## Perf
- [ ] Heavy pages lazy-load with `React.lazy` + `<Suspense>`.
- [ ] Images use appropriate sizes; no 1080p thumbnails.
- [ ] Face / camera pages honour `getDeviceProfile()` throttles.
- [ ] `?perf=1` overlay measures acceptable timings on a mid-tier Android.

## Statutory role
- [ ] Employee Code column hidden — see `docs/STATUTORY_VISIBILITY_CHECKLIST.md`.
- [ ] Nav label reads "Administrator" (not "Statutory Admin").
- [ ] Bulk attendance + salary edits permitted.

## Reusable primitives
- `src/components/ui/Skeleton.tsx`
- `src/components/ui/ResponsiveTable.tsx`
- `src/components/ui/PerfOverlay.tsx` (enable with `?perf=1`)
- `src/lib/deviceProfile.ts`
- `src/lib/perfProfiler.ts`

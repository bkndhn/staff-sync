# Attendance Export (CSV + PDF) in Staff List Order

## Problem

The Attendance page's Download button calls `exportAttendancePDF`, which builds its own row list from the raw `staff` array. That list is unfiltered and unsorted, so the PDF order does not match what is on screen (which is already sorted by `displayOrder`, then name, with sequential S.No). There is no CSV export at all on this page.

## What changes

1. **Export the on-screen rows, not a re-derived list.** Pass the already-sorted `combinedAttendanceData` (the same array the table renders) to the export helpers, so PDF/CSV order and S.No exactly match the Staff page order.

2. **New CSV export.** A "CSV" action next to the existing Download button downloads the same day's attendance as a spreadsheet-friendly file.

3. **Columns** (both formats): S.No, Emp Code, Name, Branch, Floor, Designation, Shift, Status, In Time, Out Time, Total Hours, Overtime.
   - Emp Code is omitted when the signed-in user is a statutory admin, using the existing role-visibility helper — consistent with the rest of the app.
   - Status shows "Absent (Uninformed)" where flagged, matching the table.

4. **Filters respected.** Exports reflect the active branch/floor/shift/search filters and the selected date, so what you see is what you download.

5. Both buttons are visible on mobile and desktop in the existing header action group, with the same compact styling.

## Technical notes

- Add `exportAttendanceRowsCSV` and `exportAttendanceRowsPDF` to `src/utils/attendancePeriodExport.ts` (already the home for jsPDF/autoTable/XLSX attendance exports), taking a typed row array plus a title and a `showEmployeeCode` flag.
- In `src/components/AttendanceTracker.tsx`, replace `handleExportPDF`'s call to `exportAttendancePDF` with the new row-based PDF helper, and add `handleExportCSV`. `combinedAttendanceData` already carries every needed field (`serialNo`, `employeeCode`, `originalName`, `location`, `floor`, `designation`, `shift`, `status`, `isUninformed`, `arrivalTime`, `leavingTime`, `totalHours`, `overtimeHours`).
- Emp Code gating via `src/lib/roleVisibility.ts`, same helper used by the table.
- CSV via `XLSX.utils.json_to_sheet` + `XLSX.write` with `bookType: 'csv'`.
- No changes to attendance data, services, or edge functions — presentation only.

# Statutory Role — Column Visibility Regression Checklist

The `statutory_admin` role must **never** see the internal Employee Code
(biometric device id) in any table, dashboard, CSV, or PDF.

## Single source of truth

All role-based column decisions live in `src/lib/roleVisibility.ts`.

```ts
import { canSeeEmployeeCode, hideEmployeeCode } from '@/lib/roleVisibility';
```

Do **not** inline `role === 'statutory_admin'` checks in components — always
call a helper from `roleVisibility.ts`. If a new column becomes role-gated,
add a helper there and consume it everywhere the column is rendered or
exported.

## Manual regression checklist

Run through this list after any change to Staff, Salary, Attendance,
StatutoryDashboard, or export utilities.

Log in as **Statutory Admin** and confirm:

- [ ] **Staff Management** — no "Emp Code" column in the table header or rows.
- [ ] **Staff Management → Column picker** — no "Emp Code" toggle listed.
- [ ] **Attendance → Daily table** — no "Emp Code" column.
- [ ] **Attendance → Combined/monthly view** — no "Emp Code" column.
- [ ] **Attendance → PDF export** — no Employee Code header or value.
- [ ] **Salary Management → Payroll table** — no "Emp Code" column; totals row
      colspan still aligns.
- [ ] **Salary Management → Excel/CSV export** — no Employee Code column.
- [ ] **Salary Management → PDF export** — no Employee Code column.
- [ ] **Salary Management → Statutory (ESI/PF) exports** — no Employee Code.
- [ ] **Salary Management → Bulk salary slips PDF** — no Employee Code.
- [ ] **Dashboard** — no Employee Code column in any staff-listing widget.
- [ ] **Leave Management** — no Employee Code column.
- [ ] **Settings** — no Employee Code surfaced (statutory portal config only).

Log in as **Admin** and confirm Employee Code is still visible everywhere it
was before (no accidental regressions in the other direction).

## When you add a new table or export

1. Import `canSeeEmployeeCode` (or the relevant helper) from
   `@/lib/roleVisibility`.
2. Gate the `<th>`, every `<td>`, any column-picker entry, and any CSV/PDF
   header + row.
3. Update `colSpan` totals if you have a summary/footer row.
4. Add the new surface as a bullet to this checklist.

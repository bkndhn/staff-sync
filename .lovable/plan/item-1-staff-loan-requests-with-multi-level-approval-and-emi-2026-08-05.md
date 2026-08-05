# Item 1 — Staff Loan Requests with Multi-Level Approval and EMI

Scoped to fit the remaining budget. Everything below is one build; items 2-4 from the earlier plan are deferred.

## What staff get

- "Loan Request" section in the Staff Portal: amount, reason, number of EMI months (1 = single deduction, 2+ = multi), preferred start month.
- Live EMI preview before submitting.
- Request list with status (Pending Manager -> Pending Admin -> Approved / Rejected) and rejection reason.
- Approved loan summary: sanctioned amount, EMI, months already deducted with amounts, total deducted, balance pending, expected closing month.

## Approval routing

- Amount thresholds stored in settings: up to a configured amount a Manager can approve alone; above it, Admin approval is also required.
- Approvers see only requests waiting on their level; approve or reject with a note.
- Each action is written to the approval history and the audit log.

## After final approval

- The loan is written into the existing advances flow as an EMI schedule (one row per month: month, amount, paid/pending).
- Payroll picks up the current month's EMI automatically as an advance deduction.
- Admin can change any single month's EMI amount; the remaining balance re-spreads over the remaining months.
- "Close loan" action to settle the balance in one go.

## Admin/Manager visibility

- Loan approvals list with filters by status.
- Staff page shows each employee's active loan: deducted so far, pending, monthly EMI.
- Salary page shows pending advance per staff after payroll is generated.

## Technical notes

- New tables (tenant-scoped, service-role only, reached through the existing `data-api` edge function):
  - `loan_requests` — staff, amount, reason, emi_months, start month/year, status, current/required approval level, approval history.
  - `loan_emi_schedule` — loan, month, year, amount, status, deducted amount.
- Approval thresholds stored in `app_settings` under a loan-approval key, editable in Settings.
- New `loanService.ts` on the frontend; `data-api` ACL extended for the two tables with role checks (staff can create/read own; manager/admin approve).
- Reuses the existing notification service for status alerts.

## Out of scope for this build

Forgot-password rework, anti-spoof location login, and the broader enhancement list stay on the shelf until you ask for them.

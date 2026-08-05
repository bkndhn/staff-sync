# Staff Loans, Password Reset Flow, Anti-Spoof Location Login

Four separate work items, each sized to roughly one credit. I will build them **one at a time** and stop after each so you can decide whether to continue.

---

## Item 1 — Staff loan requests with multi-level approval and EMI

**Staff side (Staff Portal)**
- New "Loan / Advance Request" screen: amount, reason, number of EMI months (1 = single deduction, 2+ = multi), preferred start month.
- Live preview of the monthly EMI before submitting.
- Request history with status timeline (Pending Supervisor -> Manager -> Admin -> Approved / Rejected) and rejection reason.

**Approval routing (amount-based)**
- Configurable thresholds in Settings, e.g. up to X -> Manager can approve alone; above X -> also needs Admin.
- Each level sees only the requests waiting on them; approve / reject with note; every action logged in the audit log.
- Push notification to the staff member and to the next approver at each step.

**On final approval**
- Loan converts into an advance record with an EMI schedule (month, amount, paid/pending).
- Monthly deduction happens automatically during payroll; an admin can edit any single month's EMI amount (remaining balance re-spreads over the remaining months).
- Early full settlement option.

**Visibility**
- Staff page + Staff Portal show: sanctioned amount, EMI, which months were already deducted with amounts, total deducted, balance pending, expected closure month.
- Salary page shows **pending advance after payroll generation** per staff.

Technical: new tables `loan_requests`, `loan_approvals`, `loan_emi_schedule` (tenant-scoped, service-role only, reached via `data-api`); new approval settings row; payroll deduction hook in the existing advance flow.

---

## Item 2 — Fix the Forgot Password flow

Current problem: the Forgot link runs on the same form as sign-in, so the error message appears mixed with the password field and the reset path is unclear. Also admin/manager accounts are custom accounts (not Supabase Auth users), so the current `resetPasswordForEmail` call cannot work for them.

New flow:
1. "Forgot Password?" opens its own step — **email only**, no password field.
2. Submit -> backend generates a one-time reset token, emails the link, and always shows the same neutral "If this account exists, a reset link has been sent" message (no account enumeration).
3. The link opens the existing Reset Password page, where the user sets a new password twice; token is single-use and expires in 30 minutes.
4. Success -> redirected back to login to sign in with the new password.
5. Staff (phone-based) logins get a separate note: their reset is done by the admin from Staff Management.

Requires an email sender to be configured for the reset mail; if you prefer, step 2 can instead raise a request that an admin approves in-app.

---

## Item 3 — Bullet-proof, spoof-resistant location login (morning / evening auto-detect)

- Punch screen auto-detects whether it is the morning (IN) or evening (OUT) window from the configured shift windows — no manual choice.
- Location gate: high-accuracy GPS required, punch blocked outside the site geofence, with distance shown.
- Anti-spoof stack:
  - Reject Android/iOS mock-location reports and known fake-GPS indicators (native check via Capacitor).
  - Reject impossible readings: zero-drift coordinates, teleport jumps (speed check between punches), stale/cached fixes, poor accuracy readings.
  - Device binding: punch only from the enrolled device fingerprint.
  - Server-side re-validation — the browser's claim is never trusted; the edge function recomputes distance, window and device match and stamps the verdict.
  - Every rejected attempt logged with reason for admin review.
- Admin view of flagged/suspicious punches.

---

## Item 4 — "World class" enhancements shortlist

Delivered as a prioritised list first, then we pick what to build:
- Approval inbox with one place for leave / loan / attendance approvals.
- Payslip PDF with e-mail + WhatsApp delivery and download from Staff Portal.
- Attendance regularisation requests from staff.
- Analytics: attrition risk, overtime cost, late trend per floor.
- Multi-language UI and full offline mode for the punch screen.
- Data export / retention & backup automation per client.

---

## Order and budget

I will start with **Item 1**, stop, and report. Nothing else gets built unless you say continue. If you want a different starting item, say which.

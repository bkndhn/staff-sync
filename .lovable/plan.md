# Launch readiness and next steps

## Is it real or a dummy app?

Real. It is a multi-tenant workforce/payroll product, not a demo shell:

- Tenant isolation enforced server-side in the `data-api` edge function (every read/write scoped by `tenant_id` + role ACL).
- Real payroll engine: attendance-driven salary, statutory deductions, advances, loan EMI recovery, overrides, payroll runs and snapshots.
- Real attendance capture: face kiosk, biometric device sync, QR, break tracking, geofencing with anti-spoofing, server-authoritative punch time.
- Real workflows: leave and loan multi-level approvals, grievances, audit logs, announcements.
- Staff self-service portal with device binding, password reset, payslips.
- Super Admin console for onboarding, limits, suspension, plan control.

## Can you launch now?

Yes — for a paid pilot with a handful of clients. The core (auth, isolation, payroll, attendance) is production-grade.

Before charging at scale, close these:

1. Billing and plan enforcement — plans exist on `tenants` but there is no subscription, invoice, or hard enforcement of limits at signup/renewal.
2. Payroll maker–checker approval — payroll is generated in one step; no second-person approval or lock before disbursement.
3. Pre-payroll anomaly checks — flag overtime spikes, duplicate bank accounts, absences with no deduction, missing salary components.
4. Backup and data export per tenant — self-serve full-data export and restore evidence for client trust.
5. Uptime/error monitoring surfaced to Super Admin (error rates per tenant, failed edge calls, device sync failures).

## World-class feature roadmap

### Phase 1 — Trust and money (highest value)
- Maker–checker payroll approval with locked runs and disbursement status.
- Pre-run anomaly and fraud detection panel.
- Payroll variance analysis vs previous month (waterfall: hikes, new joiners, exits, overtime, advances).
- Billing tiers: plan, seat count, invoice history, auto-suspend on non-payment.

### Phase 2 — Employee experience
- Interactive payslip with earnings/deductions chart and one-tap "raise a query" to HR.
- Reimbursements and expense claims flowing into the next payroll run.
- Push/WhatsApp notifications for payslip, leave, loan, and attendance approvals.
- Attendance regularisation requests (missed punch) with approval flow.

### Phase 3 — Compliance and scale
- Government-ready EPFO/ESIC export files and Form 16 / TDS automation.
- Full-text audit-trail export per tenant with tamper-evident hashing.
- Shift roster re-enable with auto-scheduling and coverage warnings.
- Predictive payroll cost forecast for the next 3–6 months.

### Phase 4 — Growth
- Self-serve tenant signup with trial, driven by the existing onboarding wizard.
- Native mobile shell (Capacitor project already scaffolded) with offline punch queue.
- Public API + webhooks for accounting integrations (Tally, Zoho Books).

## Suggested immediate build

Phase 1, in order: payroll approval workflow, then anomaly checks, then variance analysis, then billing tiers. Each is a self-contained change set built on existing `payroll_runs` / `payroll_snapshots` / `tenants` tables.

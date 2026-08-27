# Complete payroll reliability, RBAC, audit, and error alerting

## Scope

1. **Payroll end-to-end stability test**
   - Add a Playwright test that authenticates with the managed preview session, opens Salary/Payroll, crosses December/January month boundaries, and verifies the page settles without repeated requests, navigation, crashes, or render-loop errors.
   - Add a dedicated E2E script and CI step so this regression blocks deployment.

2. **Centralized route and action authorization**
   - Define one role-to-page policy used both when restoring a saved tab and immediately before rendering content, replacing scattered permissive checks and preventing local-storage/URL manipulation from exposing pages.
   - Keep the super-admin control plane isolated from tenant operational pages.
   - Tighten the `data-api` table/action ACL for payroll and admin-only mutations, and retain tenant/location/floor/staff scoping on the server.
   - Add targeted authorization regression tests for restricted payroll/settings access and mutations.

3. **Immutable Settings audit trail**
   - Route Settings mutations through server-authorized services and record successful changes with server-derived actor, tenant, timestamp, before/after values, and action metadata.
   - Make audit records append-only for client roles; do not expose delete/update operations.
   - Add CSV export to the existing Audit Log page for compliance review.
   - Ensure user create/update/delete and Settings configuration changes are covered without logging passwords or secrets.

4. **Centralized runtime error dashboard and alerts**
   - Persist Settings and SalaryManagement boundary/runtime failures through a protected server endpoint with server-derived tenant/user identity and full stack/component stack.
   - Extend the existing Platform Health error view to show the dedicated errors and stack details; remove its backup controls so client admins cannot access backup/export functionality there either.
   - Add a server-side alert dispatcher with deduplication/rate limiting. Send chat/email only when the corresponding secrets/configuration are present; otherwise retain dashboard alerts without failing the app.

5. **Verification and recommendations**
   - Run focused unit/RBAC tests, JSX validation, and the new Playwright payroll flow.
   - Verify “Data & Backup” is absent from client Settings and Platform Health.
   - Provide a prioritized, concise roadmap of remaining world-class capabilities after the requested implementation is verified.

## Technical details

- Database schema changes, if required for append-only audit/error storage, will be made only through an approved Supabase migration with explicit grants, RLS, and immutable update/delete protections.
- Identity and tenant ownership will be derived from validated Supabase Auth/legacy sessions in Edge Functions, never from caller-provided IDs.
- Secrets, passwords, tokens, and sensitive before/after fields will be redacted before persistence or alert delivery.

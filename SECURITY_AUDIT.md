# Security Audit Report

Generated: 2026-06-28
Source: `src/data/securityFindings.json` (single source of truth — keep in sync)

## Summary

| Status  | Count |
| ------- | ----- |
| Fixed   | 0     |
| Ignored | 25    |
| Open    | 0     |

All 25 findings are currently **ignored**. They are not code-fixable today because:

1. **22 of 25** are blocked by the custom `app_users`/`app_sessions` auth model. The app connects to Supabase as the `anon` role for every browser request, so standard RLS policies that gate by `auth.uid()` would lock every screen. Closing these requires the full migration in `AUTH_MIGRATION_PLAN.md`.
2. **2 of 25** require action in the Supabase Dashboard (leaked-password protection toggle, Postgres minor upgrade) — neither is reachable from code.
3. **3 of 25** are dependency CVEs handled by the new `.github/workflows/security-upgrades.yml` automated workflow.

## Findings

| internal_id | Scanner | Severity | Status | Owner | Justification |
| --- | --- | --- | --- | --- | --- |
| SUPA_auth_leaked_password_protection | supabase_linter | medium | ignored | user (Supabase dashboard) | Toggle is in Supabase Dashboard → Authentication → Policies. Not code-fixable. |
| SUPA_rls_policy_always_true | supabase_linter | high | ignored | blocked by auth migration | Anon-role app; tightening policies needs Supabase Auth first. |
| SUPA_vulnerable_postgres_version | supabase_linter | medium | ignored | user (Supabase dashboard) | Upgrade via Dashboard → Project Settings → Infrastructure → Upgrade. |
| advance_entries_public_exposure | wiz_security | high | ignored | blocked by auth migration | Anon-role limitation. |
| advances_public_exposure | wiz_security | high | ignored | blocked by auth migration | Anon-role limitation. |
| app_settings_public_writable | wiz_security | high | ignored | blocked by auth migration | Settings panel writes from browser as anon. |
| app_users_password_hash_exposure | wiz_security | critical | ignored | blocked by auth migration | Login uses auth-login edge function; legacy table retired by migration step 9. |
| attendance_public_exposure | wiz_security | high | ignored | blocked by auth migration | Anon-role limitation. |
| break_events_public_exposure | wiz_security | high | ignored | blocked by auth migration | Anon-role limitation. |
| face_embeddings_public_exposure | wiz_security | critical | ignored | blocked by auth migration | Biometric templates (128-d floats, non-reversible); still PII. |
| face_registration_logs_public_exposure | wiz_security | medium | ignored | blocked by auth migration | Audit table, anon-role limitation. |
| face_samples_storage_public_exposure | wiz_security | high | ignored | blocked by auth migration | Bucket private; policy allows anon SELECT for kiosk. Will move to signed-URL broker. |
| leave_requests_public_exposure | wiz_security | high | ignored | blocked by auth migration | Anon-role limitation. |
| locations_device_config_public_exposure | wiz_security | medium | ignored | blocked by auth migration | Kiosk boot reads device config as anon. |
| old_staff_records_public_exposure | wiz_security | high | ignored | blocked by auth migration | Anon-role limitation. |
| part_time_advance_tracking_public_exposure | wiz_security | high | ignored | blocked by auth migration | Anon-role limitation. |
| payroll_runs_public_exposure | wiz_security | high | ignored | blocked by auth migration | Anon-role limitation. |
| payroll_snapshots_public_exposure | wiz_security | high | ignored | blocked by auth migration | Anon-role limitation. |
| punch_events_public_exposure | wiz_security | high | ignored | blocked by auth migration | device-push uses service token; browser kiosk still uses anon. |
| salary_hikes_public_exposure | wiz_security | high | ignored | blocked by auth migration | Anon-role limitation. |
| salary_manual_overrides_public_exposure | wiz_security | high | ignored | blocked by auth migration | Anon-role limitation. |
| staff_table_public_exposure | wiz_security | critical | ignored | blocked by auth migration | Largest PII surface. |
| vulnerable_dependencies_critical | dependency_audit | critical | ignored | automated workflow | Handled by `.github/workflows/security-upgrades.yml`. |
| vulnerable_dependencies_high | dependency_audit | high | ignored | automated workflow | Handled by `.github/workflows/security-upgrades.yml`. |
| vulnerable_dependencies_medium | dependency_audit | medium | ignored | automated workflow | Handled by `.github/workflows/security-upgrades.yml`. |

## How to clear these

- **22 anon-role findings** → Execute `AUTH_MIGRATION_PLAN.md` end-to-end. Single migration, single re-scan, all 22 close together.
- **3 dependency findings** → Wait for the next weekly run of `security-upgrades.yml` or trigger manually from GitHub Actions.
- **2 dashboard findings** → User clicks the toggle / upgrade button in Supabase Dashboard, then re-runs the scan.

## Scan Delta (template)

Append a new section below after each rescan:

```
## Scan Delta YYYY-MM-DD
- Closed: <internal_id>, <internal_id>
- New:    <internal_id>
- Still open: <count>
```

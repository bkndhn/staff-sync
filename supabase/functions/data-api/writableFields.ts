// Fixed per-table allowlists of fields that may be written through data-api.
// Generated from the live schema; any field not listed here is dropped from
// insert/update/upsert payloads. When a migration adds a column the app must
// write, add it here too.

export const WRITABLE_FIELDS: Record<string, readonly string[]> = {
  staff: ["id", "name", "location", "type", "experience", "basic_salary", "incentive", "hra", "total_salary", "joined_date", "is_active", "initial_salary", "sunday_penalty", "salary_calculation_days", "display_order", "salary_supplements", "meal_allowance", "contact_number", "address", "photo_url", "floor", "designation", "allowance_calc_modes", "meal_allowance_threshold", "staff_accommodation", "bank_account_number", "ifsc_code", "bank_name", "payment_mode", "next_hike_date", "hike_interval_months", "statutory_deductions", "shift_window", "pf_number", "esi_number", "device_id", "exempt_from_late_deduction", "is_statutory", "employee_code", "password_hash", "must_change_password", "email"],
  attendance: ["id", "staff_id", "date", "status", "attendance_value", "is_sunday", "is_part_time", "staff_name", "shift", "location", "salary", "salary_override", "arrival_time", "leaving_time", "settlement_location", "is_uninformed", "floor", "applied_rule_type", "applied_rule_details", "break_minutes", "net_working_minutes", "break_time_out", "break_time_in"],
  punch_events: ["id", "staff_id", "staff_name", "location", "date", "event_time", "kind", "source", "match_distance", "liveness_score", "device_label", "photo_path"],
  push_subscriptions: ["id", "staff_id", "app_user_id", "endpoint", "p256dh", "auth", "device_name"],
  break_events: ["id", "staff_id", "staff_name", "location", "date", "break_type_id", "break_type_code", "start_time", "end_time", "duration_minutes", "source", "device_label", "is_violation", "violation_reason", "notes", "created_by"],
  break_types: ["id", "name", "code", "default_minutes", "max_minutes", "is_paid", "is_active", "sort_order"],
  break_policies: ["id", "location", "designation_id", "break_type_id", "max_per_day", "max_minutes_per_break", "max_total_minutes_per_day", "deduct_from_hours", "grace_minutes"],
  leave_requests: ["id", "staff_id", "staff_name", "location", "leave_date", "leave_end_date", "leave_type", "reason", "status", "manager_comment", "reviewed_by", "reviewed_at", "current_approval_level", "required_approval_levels", "approval_history"],
  loan_requests: ["id", "staff_id", "staff_name", "location", "floor", "amount", "reason", "emi_months", "start_month", "start_year", "status", "current_approval_level", "required_approval_levels", "approval_history", "rejection_reason", "advance_entry_id", "approved_at"],
  advances: ["id", "staff_id", "month", "year", "old_advance", "current_advance", "deduction", "new_advance", "notes", "basic_override", "incentive_override", "hra_override", "sunday_penalty_override"],
  advance_entries: ["id", "staff_id", "entry_date", "amount", "purpose", "month", "year", "deduct_periods", "start_deduct_month", "start_deduct_year", "total_deducted"],
  payroll_runs: ["id", "month", "year", "status", "generated_at", "generated_by", "submitted_by", "submitted_at", "approved_by", "approved_at", "rejected_by", "rejected_at", "rejection_reason", "locked_at", "total_net", "headcount"],
  payroll_snapshots: ["id", "run_id", "staff_id", "staff_snapshot", "salary_detail", "seal", "current_hash"],
  salary_hikes: ["id", "staff_id", "old_salary", "new_salary", "hike_date", "reason", "breakdown"],
  salary_manual_overrides: ["id", "staff_id", "month", "year", "basic_override", "incentive_override", "hra_override", "meal_allowance_override", "sunday_penalty_override", "salary_supplements_override", "late_coming_deduction_override", "early_leave_deduction_override"],
  salary_disbursements: ["id", "staff_id", "month_year", "amount", "payment_mode", "transaction_ref", "notes", "disbursed_at"],
  payout_batches: ["id", "month", "year", "status", "bank_format", "debit_account", "total_amount", "payee_count", "cancelled_reason", "created_by", "approved_by", "exported_by", "completed_by", "is_test"],
  payout_batch_items: ["id", "batch_id", "staff_id", "month", "year", "staff_name", "net_amount", "bank_account_number", "ifsc_code", "payment_mode", "status", "utr_ref", "failure_reason"],
  payslip_links: ["id", "staff_id", "token_hash", "month", "year", "snapshot", "issued_by", "expires_at", "revoked_at", "view_count", "last_viewed_at"],
  face_embeddings: ["id", "staff_id", "staff_name", "angle_label", "descriptor", "descriptor_dim", "image_path", "quality_score", "is_approved", "captured_by", "notes", "model_version", "quality_metrics"],
  // Fingerprints are created only by the fingerprint-auth function (server-verified); here only labels may change.
  staff_fingerprints: ["id", "device_label"],
  face_registration_logs: ["id", "staff_id", "embedding_id", "action", "actor", "reason", "metadata"],
  old_staff_records: ["id", "original_staff_id", "name", "location", "type", "experience", "basic_salary", "incentive", "hra", "total_salary", "joined_date", "left_date", "reason", "total_advance_outstanding", "last_advance_data", "contact_number", "address", "photo_url"],
  part_time_advance_tracking: ["id", "staff_name", "location", "week_start_date", "year", "month", "week_number", "opening_balance", "advance_given", "earnings", "adjustment", "pending_salary", "closing_balance", "notes"],
  part_time_settlements: ["id", "staff_name", "location", "settlement_key", "is_settled", "settled_at", "settled_by"],
  app_settings: ["id", "key", "value", "statutory_login_details"],
  locations: ["id", "name", "display_name", "is_active", "device_type", "device_ip", "device_port", "db_connection_string", "last_sync_time", "latitude", "longitude", "radius_meters"],
  designations: ["id", "name", "display_name", "is_active", "sort_order", "shift_start", "shift_end", "grace_late_min", "grace_early_min", "min_hours_full", "min_hours_half", "morning_cutoff", "early_exit_time", "evening_verification_time", "full_day_requires_morning", "late_deduction_rate", "early_deduction_rate"],
  floors: ["id", "location_name", "name", "is_active", "sort_order"],
  salary_categories: ["id", "name", "display_name", "is_active", "sort_order"],
  location_shift_config: ["id", "location_name", "shift_start", "shift_end", "grace_late_min", "grace_early_min", "min_hours_full", "min_hours_half", "morning_cutoff", "early_exit_time", "full_day_requires_morning", "allow_manager_override"],
  location_designation_shift_config: ["id", "location_name", "designation_id", "shift_start", "shift_end", "grace_late_min", "grace_early_min", "min_hours_full", "min_hours_half", "morning_cutoff", "early_exit_time", "evening_verification_time", "full_day_requires_morning", "late_deduction_rate", "early_deduction_rate"],
  statutory_portal_config: ["id", "visible_pages", "dashboard_widgets", "data_visibility"],
  statutory_policies: ["id", "effective_from", "tds", "pf", "esi", "pt", "lwf", "notes", "created_by", "leave"],
  shift_rosters: ["id", "staff_id", "date", "shift_key", "location", "is_published"],
  workflow_configs: ["id", "name", "entity_type", "levels", "is_active"],
  staff_grievances: ["id", "staff_id", "type", "target_date", "description", "status", "resolution_notes", "current_approval_level", "required_approval_levels", "approval_history"],
  device_status: ["id", "device_id", "device_name", "location", "last_seen_at", "status", "ip_address", "total_punches_today"],
  ai_insights: ["id", "type", "insight_text", "severity", "staff_id", "is_active"],
  announcements: ["id", "title", "content", "priority", "created_by", "is_active"],
  app_users: ["id", "email", "password_hash", "full_name", "role", "location", "is_active", "location_id", "floor", "floor_id", "super_admin_role"],
  tenants: ["id", "name", "status", "staff_limit", "slug", "contact_name", "contact_email", "contact_phone", "plan", "notes", "staff_portal_enabled", "location_limit", "sub_user_limit", "staff_device_lock_enabled"],
  tenant_subscriptions: ["id", "plan", "billing_cycle", "amount", "currency", "status", "trial_ends_at", "current_period_start", "current_period_end"],
  profile_change_requests: ["id", "staff_id", "requested_changes", "status", "resolution_notes", "resolved_by", "resolved_at"],
  attendance_regularizations: ["id", "staff_id", "location", "target_date", "request_type", "current_status", "requested_status", "punch_in_time", "punch_out_time", "reason", "status", "resolution_notes", "resolved_by", "resolved_at"],
  letter_requests: ["id", "staff_id", "letter_type", "purpose", "status", "resolution_notes", "resolved_by", "resolved_at", "document_url"],
  staff_notifications: ["id", "staff_id", "app_user_id", "type", "title", "message", "action_url", "tab_id", "is_read"],
  tax_declarations: ["id", "staff_id", "fy", "regime", "items", "status", "review_notes", "reviewed_by", "reviewed_at"],
  expense_claims: ["id", "staff_id", "staff_name", "location", "claim_date", "category", "amount", "description", "receipt_url", "status", "reviewed_by", "review_notes", "reviewed_at", "paid_month", "paid_year"],
  petty_cash_sheets: ["id", "location", "date", "template_type", "received_amount", "full_time_meal_total", "part_time_meal_total", "meal_total", "expenses_total", "transport_total", "total_expense", "balance", "status", "verified_by", "verified_at", "notes", "created_by"],
  petty_cash_staff_meals: ["id", "sheet_id", "staff_id", "staff_name", "designation", "staff_type", "attendance_status", "amount", "display_order"],
  petty_cash_expenses: ["id", "sheet_id", "category", "label", "amount", "notes", "display_order", "voucher_image"],
  petty_cash_transports: ["id", "sheet_id", "transport_name", "count", "freight", "auto", "hamali", "total", "display_order"],
  api_keys: ["id", "name", "key_prefix", "key_hash", "scopes", "created_by", "last_used_at", "revoked_at"],
  webhook_endpoints: ["id", "url", "secret", "events", "is_active", "description", "last_delivery_at", "failure_count"],
  webhook_deliveries: ["id", "endpoint_id", "event", "payload", "status_code", "ok", "error", "duration_ms"],
  notification_preferences: ["id", "daily_attendance_enabled", "daily_attendance_time", "timezone", "uninformed_leave_enabled", "salary_credit_enabled", "last_daily_sent_date", "punch_alerts_enabled"],
  alert_schedules: ["id", "kind", "label", "enabled", "audience_roles", "times", "days", "timing", "offset_minutes", "day_of_month"],
  notification_log: ["id", "category", "audience", "staff_id", "app_user_id", "title", "body", "action_url", "status", "push_count", "error", "metadata"],
};

// Narrower lists for the staff role (self-service writes). Fields left out are
// manager/admin decisions or routing fields a staff member must never set.
export const STAFF_WRITABLE_FIELDS: Record<string, readonly string[]> = {
  push_subscriptions: ["id", "staff_id", "endpoint", "p256dh", "auth", "device_name"],
  break_events: ["id", "staff_id", "staff_name", "location", "date", "break_type_id", "break_type_code", "start_time", "end_time", "duration_minutes", "source", "device_label", "is_violation", "violation_reason", "notes", "created_by"],
  leave_requests: ["id", "staff_id", "staff_name", "location", "leave_date", "leave_end_date", "leave_type", "reason", "status", "required_approval_levels"],
  loan_requests: ["id", "staff_id", "staff_name", "location", "floor", "amount", "reason", "emi_months", "start_month", "start_year", "status", "current_approval_level", "required_approval_levels", "approval_history"],
  face_embeddings: ["id", "staff_id", "staff_name", "angle_label", "descriptor", "descriptor_dim", "image_path", "quality_score", "captured_by", "notes", "model_version", "quality_metrics"],
  face_registration_logs: ["id", "staff_id", "embedding_id", "action", "actor", "reason", "metadata"],
  profile_change_requests: ["id", "staff_id", "requested_changes", "status"],
  attendance_regularizations: ["id", "staff_id", "location", "target_date", "request_type", "current_status", "requested_status", "punch_in_time", "punch_out_time", "reason", "status"],
  letter_requests: ["id", "staff_id", "letter_type", "purpose", "status"],
  staff_notifications: ["id", "staff_id", "type", "title", "message", "action_url", "tab_id", "is_read"],
  expense_claims: ["id", "staff_id", "staff_name", "location", "claim_date", "category", "amount", "description", "receipt_url", "status"],
  // Staff may declare but never approve; editing resets status to Submitted (DB trigger).
  tax_declarations: ["id", "staff_id", "fy", "regime", "items"],
};

/** Reduce each row to the fixed allowlist for this table and role. */
export function restrictToAllowlist(
  table: string,
  role: string,
  rows: Array<Record<string, unknown>>,
): string | null {
  const base = WRITABLE_FIELDS[table];
  if (!base) return "Writes are not permitted on this table";
  const list = role === "staff" ? STAFF_WRITABLE_FIELDS[table] : base;
  if (!list) return "Writes are not permitted on this table";
  const allowed = new Set(list);
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!allowed.has(k)) delete r[k];
    }
  }
  return null;
}

import { describe, expect, it } from 'vitest';
import { restrictToAllowlist, WRITABLE_FIELDS } from '../../supabase/functions/data-api/writableFields';

describe('data-api write allowlist', () => {
  it('drops fields that are not on the fixed list', () => {
    const rows = [{ name: 'Asha', reset_request_hash: 'x', tenant_id: 'other', bogus_col: 1 }];
    expect(restrictToAllowlist('staff', 'admin', rows)).toBeNull();
    expect(rows[0]).toEqual({ name: 'Asha' });
  });

  it('keeps staff self-service writes narrow', () => {
    const rows = [{ leave_date: '2026-11-04', reason: 'Fever', reviewed_by: 'me', manager_comment: 'ok' }];
    expect(restrictToAllowlist('leave_requests', 'staff', rows)).toBeNull();
    expect(rows[0]).toEqual({ leave_date: '2026-11-04', reason: 'Fever' });
  });

  it('stops staff from routing notifications to a manager', () => {
    const rows = [{ title: 't', app_user_id: 'manager-1', is_read: true }];
    restrictToAllowlist('staff_notifications', 'staff', rows);
    expect(rows[0]).toEqual({ title: 't', is_read: true });
  });

  it('rejects writes to tables without a list', () => {
    expect(restrictToAllowlist('not_a_table', 'admin', [{ a: 1 }])).toMatch(/not permitted/);
  });

  it('never lists server-stamped or secret fields', () => {
    for (const cols of Object.values(WRITABLE_FIELDS)) {
      expect(cols).not.toContain('tenant_id');
      expect(cols).not.toContain('created_at');
    }
    expect(WRITABLE_FIELDS.staff).not.toContain('reset_pin');
    expect(WRITABLE_FIELDS.app_users).not.toContain('auth_id');
  });
});

import { describe, expect, it } from 'vitest';
import { restrictToAllowlist } from '../../supabase/functions/data-api/writableFields';
import { canHandlePunchPhoto } from '../../supabase/functions/_shared/punchPhotoRoles';
import { findAppUserForAuth } from '../../supabase/functions/_shared/caller';

const face = () => [{ staff_id: 's1', descriptor: [1], is_approved: true }];

describe('face approval by role', () => {
  it('staff cannot approve their own face record', () => {
    const rows = face(); restrictToAllowlist('face_embeddings', 'staff', rows);
    expect(rows[0]).not.toHaveProperty('is_approved');
  });
  it.each(['supervisor', 'manager', 'admin'])('%s can approve', (role) => {
    const rows = face(); restrictToAllowlist('face_embeddings', role, rows);
    expect(rows[0].is_approved).toBe(true);
  });
});

describe('punch photos by role', () => {
  it('staff cannot attach punch photos', () => expect(canHandlePunchPhoto('staff')).toBe(false));
  it.each(['supervisor', 'floor_supervisor', 'manager', 'admin'])('%s can', (r) => expect(canHandlePunchPhoto(r)).toBe(true));
});

// Minimal fake of the server client: app_users with one unlinked admin profile.
function fakeDb(users: any[]) {
  return { from: () => {
    const f: any[] = []; let upd: any = null;
    const q: any = {
      select: () => q, update: (v: any) => { upd = v; return q; },
      eq: (k: string, v: any) => { f.push((u: any) => u[k] === v); return q; },
      is: (k: string, v: any) => { f.push((u: any) => (u[k] ?? null) === v); return q; },
      maybeSingle: async () => {
        const u = users.find((x) => f.every((t) => t(x))) ?? null;
        if (u && upd) Object.assign(u, upd);
        return { data: u };
      },
    };
    return q;
  } };
}

describe('admin access by email', () => {
  it('unconfirmed sign-up with an admin email gets nothing', async () => {
    const db = fakeDb([{ id: 'a1', role: 'admin', email: 'boss@x.com', auth_id: null }]);
    expect(await findAppUserForAuth(db, { id: 'evil', email: 'boss@x.com', email_confirmed_at: null }, 'id, role')).toBeNull();
  });
  it('confirmed email can claim an unlinked profile only once', async () => {
    const users = [{ id: 'a1', role: 'admin', email: 'boss@x.com', auth_id: null }];
    const db = fakeDb(users);
    const first = await findAppUserForAuth(db, { id: 'real', email: 'boss@x.com', email_confirmed_at: '2026-01-01' }, 'id, role');
    expect(first?.id).toBe('a1');
    const second = await findAppUserForAuth(db, { id: 'other', email: 'boss@x.com', email_confirmed_at: '2026-01-01' }, 'id, role');
    expect(second).toBeNull();
  });
});

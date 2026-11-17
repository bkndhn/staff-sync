import { describe, it, expect } from 'vitest';
import { isAttendancePut, staffDaySummary } from '../../supabase/functions/_shared/alertSlots';

describe('attendance put rule', () => {
  it('present counts as put', () => expect(isAttendancePut({ status: 'present' })).toBe(true));
  it('absent counts as put', () => expect(isAttendancePut({ status: 'absent', attendance_value: 0 })).toBe(true));
  it('empty row is not put', () => expect(isAttendancePut({ status: '', attendance_value: null })).toBe(false));
  it('no row is not put', () => expect(isAttendancePut(undefined)).toBe(false));
});

describe('7 PM staff summary', () => {
  it('present shows hours', () => expect(staffDaySummary({ inTime: '9:00 AM', outTime: '6:30 PM', minutes: 570 }).body).toContain('9h 30m'));
  it('not marked says absent', () => expect(staffDaySummary({ minutes: 0 }).title).toContain('Not marked'));
  it('marked absent', () => expect(staffDaySummary({ status: 'absent', minutes: 0 }).title).toContain('Absent'));
});

import { describe, expect, it } from 'vitest';
import { calculateAttendanceMetrics } from '../utils/salaryCalculations';

describe('calculateAttendanceMetrics leave ranges', () => {
  it('ignores malformed and reversed approved leave dates', () => {
    const result = calculateAttendanceMetrics('staff-1', [], 2026, 7, [
      { staffId: 'staff-1', status: 'approved', leaveDate: 'not-a-date' },
      { staffId: 'staff-1', status: 'approved', leaveDate: '2026-08-20', leaveEndDate: '2026-08-10' },
    ]);

    expect(result.presentDays).toBe(0);
    expect(result.totalPresentDays).toBe(0);
  });

  it('still counts valid non-Sunday leave days in the selected month', () => {
    const result = calculateAttendanceMetrics('staff-1', [], 2026, 7, [
      { staffId: 'staff-1', status: 'approved', leaveDate: '2026-08-03', leaveEndDate: '2026-08-04' },
    ]);

    expect(result.presentDays).toBe(2);
  });
});
// Timed phone alerts set up by admins/managers. Sent by the server timer (every 15 minutes),
// so they arrive even when the app is closed.
import { dataApi } from '../lib/dataApi';

export type AlertKind =
  | 'attendance_summary'
  | 'mark_attendance'
  | 'punch_in_reminder'
  | 'punch_out_reminder'
  | 'salary_prep'
  | 'leave_pending';

export interface AlertSchedule {
  id?: string;
  kind: AlertKind;
  label?: string | null;
  enabled: boolean;
  audienceRoles: string[];
  times: string[];
  days: number[];
  timing: 'fixed' | 'before_shift';
  offsetMinutes: number;
  dayOfMonth: number | null;
}

export const ALERT_KIND_INFO: Record<AlertKind, { title: string; hint: string; toStaff: boolean }> = {
  attendance_summary: { title: 'Attendance report', hint: 'How many are in, not in yet and punched out.', toStaff: false },
  mark_attendance: { title: 'Check attendance reminder', hint: 'Only sent when some staff have no attendance yet.', toStaff: false },
  leave_pending: { title: 'Leave requests waiting', hint: 'Only sent when leave requests are waiting.', toStaff: false },
  salary_prep: { title: 'Salary preparation', hint: 'Reminder to check attendance, advances and run payroll.', toStaff: false },
  punch_in_reminder: { title: 'Punch IN reminder (staff)', hint: 'Sent only to staff who have not punched in yet.', toStaff: true },
  punch_out_reminder: { title: 'Punch OUT reminder (staff)', hint: 'Sent only to staff still punched in.', toStaff: true },
};

export const ROLE_OPTIONS: { id: string; label: string }[] = [
  { id: 'admin', label: 'Admin' },
  { id: 'manager', label: 'Manager' },
  { id: 'floor_supervisor', label: 'Floor supervisor' },
  { id: 'supervisor', label: 'Supervisor' },
  { id: 'statutory_admin', label: 'Statutory admin' },
  { id: 'petty_cash_manager', label: 'Petty cash' },
];

export const RECOMMENDED: AlertSchedule[] = [
  { kind: 'attendance_summary', enabled: true, audienceRoles: ['admin', 'manager', 'floor_supervisor'], times: ['10:00', '13:00', '19:00'], days: [1, 2, 3, 4, 5, 6], timing: 'fixed', offsetMinutes: 0, dayOfMonth: null },
  { kind: 'mark_attendance', enabled: true, audienceRoles: ['manager', 'floor_supervisor', 'supervisor'], times: ['11:00'], days: [1, 2, 3, 4, 5, 6], timing: 'fixed', offsetMinutes: 0, dayOfMonth: null },
  { kind: 'punch_in_reminder', enabled: true, audienceRoles: [], times: [], days: [1, 2, 3, 4, 5, 6], timing: 'before_shift', offsetMinutes: 15, dayOfMonth: null },
  { kind: 'punch_out_reminder', enabled: true, audienceRoles: [], times: [], days: [1, 2, 3, 4, 5, 6], timing: 'before_shift', offsetMinutes: 0, dayOfMonth: null },
  { kind: 'leave_pending', enabled: true, audienceRoles: ['admin', 'manager'], times: ['10:00', '16:00'], days: [1, 2, 3, 4, 5, 6], timing: 'fixed', offsetMinutes: 0, dayOfMonth: null },
  { kind: 'salary_prep', enabled: true, audienceRoles: ['admin'], times: ['10:00'], days: [0, 1, 2, 3, 4, 5, 6], timing: 'fixed', offsetMinutes: 0, dayOfMonth: 28 },
];

const fromRow = (r: any): AlertSchedule => ({
  id: r.id,
  kind: r.kind,
  label: r.label,
  enabled: r.enabled !== false,
  audienceRoles: r.audience_roles || [],
  times: r.times || [],
  days: r.days || [],
  timing: r.timing === 'before_shift' ? 'before_shift' : 'fixed',
  offsetMinutes: Number(r.offset_minutes ?? 15),
  dayOfMonth: r.day_of_month ?? null,
});

const toRow = (s: AlertSchedule) => ({
  kind: s.kind,
  label: s.label ?? null,
  enabled: s.enabled,
  audience_roles: ALERT_KIND_INFO[s.kind].toStaff ? [] : s.audienceRoles,
  times: s.timing === 'before_shift' ? [] : [...new Set(s.times)].sort(),
  days: s.days,
  timing: s.timing,
  offset_minutes: s.offsetMinutes,
  day_of_month: s.dayOfMonth,
});

export const alertScheduleService = {
  async list(): Promise<AlertSchedule[]> {
    const { data, error } = await dataApi.from('alert_schedules').select('*').order('created_at', { ascending: true });
    if (error || !data) return [];
    return (data as any[]).map(fromRow);
  },
  async save(s: AlertSchedule): Promise<string | null> {
    const res = s.id
      ? await dataApi.from('alert_schedules').update(toRow(s)).eq('id', s.id)
      : await dataApi.from('alert_schedules').insert(toRow(s));
    return res.error ? (res.error as any).message || 'Could not save' : null;
  },
  async remove(id: string): Promise<boolean> {
    const { error } = await dataApi.from('alert_schedules').delete().eq('id', id);
    return !error;
  },
};

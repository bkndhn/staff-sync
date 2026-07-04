import { dataApi } from '../lib/dataApi';
import { supabase } from '../lib/supabase';
import { BreakType, BreakEvent, BreakPolicy } from '../types';
import { auditLogService } from './auditLogService';

const pad = (n: number) => n.toString().padStart(2, '0');
const todayDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const mapType = (d: any): BreakType => ({
  id: d.id,
  name: d.name,
  code: d.code,
  defaultMinutes: d.default_minutes,
  maxMinutes: d.max_minutes,
  isPaid: !!d.is_paid,
  isActive: !!d.is_active,
  sortOrder: d.sort_order ?? 0,
});

const mapEvent = (d: any): BreakEvent => ({
  id: d.id,
  staffId: d.staff_id,
  staffName: d.staff_name ?? undefined,
  location: d.location ?? undefined,
  date: d.date,
  breakTypeId: d.break_type_id ?? undefined,
  breakTypeCode: d.break_type_code ?? undefined,
  startTime: d.start_time,
  endTime: d.end_time,
  durationMinutes: d.duration_minutes,
  source: d.source,
  deviceLabel: d.device_label ?? undefined,
  isViolation: !!d.is_violation,
  violationReason: d.violation_reason ?? undefined,
  notes: d.notes ?? undefined,
  createdBy: d.created_by ?? undefined,
  createdAt: d.created_at,
  updatedAt: d.updated_at,
});

const mapPolicy = (d: any): BreakPolicy => ({
  id: d.id,
  location: d.location ?? undefined,
  designationId: d.designation_id ?? undefined,
  breakTypeId: d.break_type_id ?? undefined,
  maxPerDay: d.max_per_day,
  maxMinutesPerBreak: d.max_minutes_per_break,
  maxTotalMinutesPerDay: d.max_total_minutes_per_day,
  deductFromHours: !!d.deduct_from_hours,
  graceMinutes: d.grace_minutes ?? 0,
});

const minutesBetween = (start: string, end: string) => {
  const [sh, sm, ss] = start.split(':').map(Number);
  const [eh, em, es] = end.split(':').map(Number);
  const s = sh * 3600 + sm * 60 + (ss || 0);
  const e = eh * 3600 + em * 60 + (es || 0);
  return Math.max(0, Math.round((e - s) / 60));
};

export const breakTypeService = {
  async list(activeOnly = false): Promise<BreakType[]> {
    let q = dataApi.from('break_types').select('*').order('sort_order', { ascending: true });
    if (activeOnly) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (error) { console.error(error); return []; }
    return (data || []).map(mapType);
  },
  async upsert(t: Partial<BreakType> & { name: string; code: string }): Promise<BreakType | null> {
    const payload: any = {
      name: t.name,
      code: t.code,
      default_minutes: t.defaultMinutes ?? 15,
      max_minutes: t.maxMinutes ?? 30,
      is_paid: t.isPaid ?? true,
      is_active: t.isActive ?? true,
      sort_order: t.sortOrder ?? 0,
    };
    if (t.id) payload.id = t.id;
    const { data, error } = await dataApi.from('break_types').upsert(payload).select().single();
    if (error) { console.error(error); return null; }
    return mapType(data);
  },
  async remove(id: string): Promise<boolean> {
    const { error } = await dataApi.from('break_types').delete().eq('id', id);
    return !error;
  },
};

export const breakEventService = {
  async list(opts: { date?: string; startDate?: string; endDate?: string; staffId?: string; location?: string } = {}): Promise<BreakEvent[]> {
    let q = (supabase as any).from('break_events').select('*').order('date', { ascending: false }).order('start_time', { ascending: false });
    if (opts.date) q = q.eq('date', opts.date);
    if (opts.startDate) q = q.gte('date', opts.startDate);
    if (opts.endDate) q = q.lte('date', opts.endDate);
    if (opts.staffId) q = q.eq('staff_id', opts.staffId);
    if (opts.location) q = q.eq('location', opts.location);
    const { data, error } = await q;
    if (error) { console.error(error); return []; }
    return (data || []).map(mapEvent);
  },

  /** Currently open break for a staff (no end_time). */
  async openBreak(staffId: string): Promise<BreakEvent | null> {
    const { data, error } = await (supabase as any).from('break_events')
      .select('*').eq('staff_id', staffId).is('end_time', null)
      .order('start_time', { ascending: false }).limit(1).maybeSingle();
    if (error || !data) return null;
    return mapEvent(data);
  },

  async start(input: {
    staffId: string; staffName?: string; location?: string;
    breakType: BreakType; source?: BreakEvent['source']; deviceLabel?: string;
    createdBy?: string; notes?: string;
  }): Promise<BreakEvent | null> {
    // Block if open break exists
    const open = await this.openBreak(input.staffId);
    if (open) {
      console.warn('[BreakService] Open break already exists');
      return open;
    }
    const payload: any = {
      staff_id: input.staffId,
      staff_name: input.staffName,
      location: input.location,
      date: todayDate(),
      break_type_id: input.breakType.id,
      break_type_code: input.breakType.code,
      start_time: nowTime(),
      source: input.source || 'web',
      device_label: input.deviceLabel,
      notes: input.notes,
      created_by: input.createdBy,
    };
    const { data, error } = await (supabase as any).from('break_events').insert(payload).select().single();
    if (error) { console.error(error); return null; }
    await auditLogService.log({
      action: 'attendance_override',
      staffId: input.staffId,
      staffName: input.staffName,
      details: `Break started: ${input.breakType.name}`,
      performedBy: input.createdBy || 'system',
    });
    return mapEvent(data);
  },

  async end(input: {
    eventId: string; staffId: string; staffName?: string;
    breakType?: BreakType; createdBy?: string;
  }): Promise<BreakEvent | null> {
    // Fetch current row to compute duration & violation
    const { data: existing } = await (supabase as any).from('break_events').select('*').eq('id', input.eventId).maybeSingle();
    if (!existing) return null;
    const endTime = nowTime();
    const duration = minutesBetween(existing.start_time, endTime);
    let isViolation = false;
    let violationReason: string | null = null;
    if (input.breakType && duration > input.breakType.maxMinutes) {
      isViolation = true;
      violationReason = `Exceeded max ${input.breakType.maxMinutes}m (took ${duration}m)`;
    }
    const { data, error } = await (supabase as any).from('break_events')
      .update({
        end_time: endTime,
        duration_minutes: duration,
        is_violation: isViolation,
        violation_reason: violationReason,
      }).eq('id', input.eventId).select().single();
    if (error) { console.error(error); return null; }
    await auditLogService.log({
      action: 'attendance_override',
      staffId: input.staffId,
      staffName: input.staffName,
      details: `Break ended (${duration}m)${isViolation ? ' — VIOLATION' : ''}`,
      performedBy: input.createdBy || 'system',
    });
    return mapEvent(data);
  },

  async upsertManual(input: Partial<BreakEvent> & { staffId: string; date: string; startTime: string }): Promise<BreakEvent | null> {
    const duration = input.endTime ? minutesBetween(input.startTime, input.endTime) : null;
    const payload: any = {
      staff_id: input.staffId,
      staff_name: input.staffName,
      location: input.location,
      date: input.date,
      break_type_id: input.breakTypeId,
      break_type_code: input.breakTypeCode,
      start_time: input.startTime,
      end_time: input.endTime ?? null,
      duration_minutes: duration,
      source: input.source || 'manual',
      device_label: input.deviceLabel,
      notes: input.notes,
      created_by: input.createdBy,
      is_violation: input.isViolation ?? false,
      violation_reason: input.violationReason ?? null,
    };
    if (input.id) payload.id = input.id;
    const { data, error } = await (supabase as any).from('break_events').upsert(payload).select().single();
    if (error) { console.error(error); return null; }
    await auditLogService.log({
      action: input.id ? 'attendance_override' : 'attendance_override',
      staffId: input.staffId,
      staffName: input.staffName,
      details: input.id ? `Break record edited` : `Manual break added`,
      performedBy: input.createdBy || 'system',
    });
    return mapEvent(data);
  },

  async remove(id: string, by?: string): Promise<boolean> {
    const { error } = await (supabase as any).from('break_events').delete().eq('id', id);
    if (!error) {
      await auditLogService.log({
        action: 'attendance_override',
        details: `Break record deleted (${id})`,
        performedBy: by || 'system',
      });
    }
    return !error;
  },

  summarize(events: BreakEvent[]): {
    count: number; totalMinutes: number; avgMinutes: number;
    violations: number; onBreak: number;
    byType: Record<string, { count: number; minutes: number }>;
  } {
    const totalMinutes = events.reduce((a, b) => a + (b.durationMinutes || 0), 0);
    const violations = events.filter(e => e.isViolation).length;
    const onBreak = events.filter(e => !e.endTime).length;
    const byType: Record<string, { count: number; minutes: number }> = {};
    for (const e of events) {
      const k = e.breakTypeCode || 'unknown';
      if (!byType[k]) byType[k] = { count: 0, minutes: 0 };
      byType[k].count++;
      byType[k].minutes += e.durationMinutes || 0;
    }
    return {
      count: events.length,
      totalMinutes,
      avgMinutes: events.length ? Math.round(totalMinutes / events.length) : 0,
      violations,
      onBreak,
      byType,
    };
  },
};

export const breakPolicyService = {
  async list(): Promise<BreakPolicy[]> {
    const { data, error } = await dataApi.from('break_policies').select('*');
    if (error) { console.error(error); return []; }
    return (data || []).map(mapPolicy);
  },
  async upsert(p: Partial<BreakPolicy>): Promise<BreakPolicy | null> {
    const payload: any = {
      location: p.location || null,
      designation_id: p.designationId || null,
      break_type_id: p.breakTypeId || null,
      max_per_day: p.maxPerDay ?? 1,
      max_minutes_per_break: p.maxMinutesPerBreak ?? 30,
      max_total_minutes_per_day: p.maxTotalMinutesPerDay ?? 60,
      deduct_from_hours: p.deductFromHours ?? false,
      grace_minutes: p.graceMinutes ?? 5,
    };
    if (p.id) payload.id = p.id;
    const { data, error } = await dataApi.from('break_policies').upsert(payload).select().single();
    if (error) { console.error(error); return null; }
    return mapPolicy(data);
  },
  async remove(id: string): Promise<boolean> {
    const { error } = await dataApi.from('break_policies').delete().eq('id', id);
    return !error;
  },
};

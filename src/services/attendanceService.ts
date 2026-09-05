import { supabase } from '../lib/supabase';
import { dataApi } from '../lib/dataApi';
import { Attendance } from '../types';
import type { DatabaseAttendance } from '../lib/supabase';
import { isSunday } from '../utils/salaryCalculations';
import { offlineSyncService } from './offlineSyncService';
import { notificationAlertsService } from './notificationAlertsService';

/** Fire-and-forget alert to admins when a staff member is marked uninformed absent */
const alertUninformed = (rec: Partial<Attendance>) => {
  if (!rec?.isUninformed || !rec.date) return;
  void notificationAlertsService.notifyUninformedLeave({
    staffName: rec.staffName,
    location: rec.location,
    floor: rec.floor,
    date: rec.date,
  });
};


export const attendanceService = {
  async getAll(): Promise<Attendance[]> {
    // If offline, we can attempt to fetch cached network response or return empty/cached state,
    // but typically cachedFetch in App.tsx handles the static view layer caching.
    const { data, error } = await dataApi
      .from('attendance')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching attendance:', error);
      throw error;
    }

    return data.map((d: any) => this.mapFromDatabase(d));
  },

  async getByDateRange(startDate: string, endDate: string): Promise<Attendance[]> {
    const { data, error } = await dataApi
      .from('attendance')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching attendance by date range:', error);
      throw error;
    }

    return data.map((d: any) => this.mapFromDatabase(d));
  },

  /** Upsert attendance record with automatic Offline Queue fallback */
  async upsert(attendance: Omit<Attendance, 'id'>): Promise<Attendance> {
    // Check network connectivity upfront
    if (!navigator.onLine) {
      console.warn('[AttendanceService] Offline detected. Queuing punch locally.');
      const queued = await offlineSyncService.enqueuePunch(attendance);
      // Return a temporarily constructed local attendance record so UI optimistic updates succeed instantly
      return {
        ...attendance,
        id: queued.id,
        attendanceValue: attendance.attendanceValue ?? (attendance.status === 'Present' ? 1 : attendance.status === 'Half Day' ? 0.5 : 0)
      };
    }

    const dbAttendance = this.mapToDatabase(attendance);
    // Always strip id from upsert payload — let the composite unique constraint
    // (staff_id, date, is_part_time) handle conflict detection so the row is
    // matched and updated correctly regardless of whether we know its PK.
    const { id: _stripId, ...upsertPayload } = dbAttendance;

    try {
      const { data, error } = await dataApi
        .from('attendance')
        .upsert([upsertPayload as any], {
          onConflict: 'staff_id,date,is_part_time'
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Try triggering flush in background in case there were pending offline punches
      setTimeout(() => {
        offlineSyncService.flushQueue((punch) => {
          // Exclude internal offline fields when flushing to remote
          const { id, queuedAt, ...punchPayload } = punch;
          return this.upsertRemoteOnly(punchPayload);
        });
      }, 1000);

      alertUninformed(attendance);
      return this.mapFromDatabase(data as any);

    } catch (error) {
      console.error('[AttendanceService] Remote upsert failed. Enqueuing locally as fallback:', error);
      const queued = await offlineSyncService.enqueuePunch(attendance);
      return {
        ...attendance,
        id: queued.id,
        attendanceValue: attendance.attendanceValue ?? (attendance.status === 'Present' ? 1 : attendance.status === 'Half Day' ? 0.5 : 0)
      };
    }
  },

  /** Dedicated remote upsert invoked during background queue flushing to prevent infinite loops */
  async upsertRemoteOnly(attendance: Omit<Attendance, 'id'>): Promise<Attendance> {
    const dbAttendance = this.mapToDatabase(attendance);
    const { id: _stripId, ...upsertPayload } = dbAttendance;
    const { data, error } = await dataApi
      .from('attendance')
      .upsert([upsertPayload as any], {
        onConflict: 'staff_id,date,is_part_time'
      })
      .select()
      .single();

    if (error) throw error;
    return this.mapFromDatabase(data as any);
  },

  async bulkUpsert(attendanceRecords: Omit<Attendance, 'id'>[]): Promise<Attendance[]> {
    if (!navigator.onLine) {
      console.warn('[AttendanceService] Bulk Offline detected. Queuing all records locally.');
      const localResults: Attendance[] = [];
      for (const rec of attendanceRecords) {
        const queued = await offlineSyncService.enqueuePunch(rec);
        localResults.push({
          ...rec,
          id: queued.id,
          attendanceValue: rec.attendanceValue ?? (rec.status === 'Present' ? 1 : rec.status === 'Half Day' ? 0.5 : 0)
        });
      }
      return localResults;
    }

    const dbRecords = attendanceRecords.map(rec => {
      const mapped = this.mapToDatabase(rec);
      const { id: _stripId, ...payload } = mapped;
      return payload;
    });

    try {
      const { data, error } = await dataApi
        .from('attendance')
        .upsert(dbRecords as any[], {
          onConflict: 'staff_id,date,is_part_time'
        })
        .select();

      if (error) throw error;
      attendanceRecords.forEach(alertUninformed);
      return data.map((d: any) => this.mapFromDatabase(d));

    } catch (error) {
      console.error('[AttendanceService] Bulk remote upsert failed. Enqueuing locally:', error);
      const localResults: Attendance[] = [];
      for (const rec of attendanceRecords) {
        const queued = await offlineSyncService.enqueuePunch(rec);
        localResults.push({
          ...rec,
          id: queued.id,
          attendanceValue: rec.attendanceValue ?? (rec.status === 'Present' ? 1 : rec.status === 'Half Day' ? 0.5 : 0)
        });
      }
      return localResults;
    }
  },

  async delete(id: string): Promise<{ error: any }> {
    // If it's a locally queued ID, just remove from IndexedDB queue
    if (id.startsWith('offline_')) {
      await offlineSyncService.removePunch(id);
      return { error: null };
    }

    const { error } = await dataApi
      .from('attendance')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting attendance:', error);
    }

    return { error };
  },

  mapFromDatabase(dbAttendance: any): Attendance {
    const attendance: Attendance = {
      id: dbAttendance.id,
      staffId: dbAttendance.staff_id,
      date: dbAttendance.date,
      status: dbAttendance.status as Attendance['status'],
      attendanceValue: dbAttendance.attendance_value ?? 0,
      isSunday: dbAttendance.is_sunday ?? undefined,
      isPartTime: dbAttendance.is_part_time ?? undefined,
      staffName: dbAttendance.staff_name ?? undefined,
      shift: dbAttendance.shift as Attendance['shift'],
      location: dbAttendance.location ?? undefined,
      floor: dbAttendance.floor ?? undefined,
      salary: dbAttendance.salary ?? undefined,
      salaryOverride: dbAttendance.salary_override ?? undefined,
      arrivalTime: dbAttendance.arrival_time ?? undefined,
      leavingTime: dbAttendance.leaving_time ?? undefined,
      breakTimeIn: dbAttendance.break_time_in ?? undefined,
      breakTimeOut: dbAttendance.break_time_out ?? undefined,
      isUninformed: dbAttendance.is_uninformed ?? undefined,
      appliedRuleType: dbAttendance.applied_rule_type ?? undefined,
      appliedRuleDetails: dbAttendance.applied_rule_details ?? undefined
    };

    // Calculate dynamic hours
    if (attendance.arrivalTime && attendance.leavingTime) {
      const [arrH, arrM] = attendance.arrivalTime.split(':').map(Number);
      const [leavH, leavM] = attendance.leavingTime.split(':').map(Number);
      let arrTotal = arrH * 60 + arrM;
      let leavTotal = leavH * 60 + leavM;
      if (leavTotal < arrTotal) leavTotal += 24 * 60; // cross midnight

      attendance.totalHours = Number(((leavTotal - arrTotal) / 60).toFixed(2));
      
      // Determine standard shift length (default to 8 if Both, otherwise 4 or 6)
      let standardHours = 8;
      if (attendance.shift === 'Morning') standardHours = 4;
      if (attendance.shift === 'Evening') standardHours = 6;
      
      // If we have applied rules with shift start/end, we can be more accurate
      if (attendance.appliedRuleDetails?.shiftStart && attendance.appliedRuleDetails?.shiftEnd) {
        const [sH, sM] = attendance.appliedRuleDetails.shiftStart.split(':').map(Number);
        const [eH, eM] = attendance.appliedRuleDetails.shiftEnd.split(':').map(Number);
        let sTotal = sH * 60 + sM;
        let eTotal = eH * 60 + eM;
        if (eTotal < sTotal) eTotal += 24 * 60;
        standardHours = (eTotal - sTotal) / 60;
      }

      if (attendance.totalHours > standardHours) {
        attendance.overtimeHours = Number((attendance.totalHours - standardHours).toFixed(2));
      } else {
        attendance.overtimeHours = 0;
      }
    } else {
      attendance.totalHours = 0;
      attendance.overtimeHours = 0;
    }

    return attendance;
  },

  mapToDatabase(attendance: Partial<Attendance>): any {
    const dbRecord: any = {
      staff_id: attendance.staffId,
      date: attendance.date,
      status: attendance.status,
      attendance_value: attendance.attendanceValue,
      is_sunday: attendance.date ? isSunday(attendance.date) : false,
      is_part_time: attendance.isPartTime || false,
      staff_name: attendance.staffName,
      shift: attendance.shift,
      location: attendance.location,
      floor: attendance.floor,
      salary: attendance.salary,
      salary_override: attendance.salaryOverride,
      arrival_time: attendance.arrivalTime,
      leaving_time: attendance.leavingTime,
      break_time_in: attendance.breakTimeIn,
      break_time_out: attendance.breakTimeOut,
      is_uninformed: attendance.isUninformed,
      applied_rule_type: attendance.appliedRuleType,
      applied_rule_details: attendance.appliedRuleDetails
    };
    if (attendance.id && !attendance.id.startsWith('offline_')) {
      dbRecord.id = attendance.id;
    }
    return dbRecord;
  }

};
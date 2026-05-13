import { supabase } from '../lib/supabase';
import { Attendance } from '../types';
import type { DatabaseAttendance } from '../lib/supabase';
import { isSunday } from '../utils/salaryCalculations';
import { offlineSyncService } from './offlineSyncService';

export const attendanceService = {
  async getAll(): Promise<Attendance[]> {
    // If offline, we can attempt to fetch cached network response or return empty/cached state,
    // but typically cachedFetch in App.tsx handles the static view layer caching.
    const { data, error } = await supabase
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
    const { data, error } = await supabase
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

    try {
      const { data, error } = await supabase
        .from('attendance')
        .upsert([dbAttendance as any], {
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
    const { data, error } = await supabase
      .from('attendance')
      .upsert([dbAttendance as any], {
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

    const dbRecords = attendanceRecords.map(this.mapToDatabase);

    try {
      const { data, error } = await supabase
        .from('attendance')
        .upsert(dbRecords as any[], {
          onConflict: 'staff_id,date,is_part_time'
        })
        .select();

      if (error) throw error;
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

    const { error } = await supabase
      .from('attendance')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting attendance:', error);
    }

    return { error };
  },

  mapFromDatabase(dbAttendance: any): Attendance {
    return {
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
      salary: dbAttendance.salary ?? undefined,
      salaryOverride: dbAttendance.salary_override ?? undefined,
      arrivalTime: dbAttendance.arrival_time ?? undefined,
      leavingTime: dbAttendance.leaving_time ?? undefined,
      isUninformed: dbAttendance.is_uninformed ?? undefined
    };
  },

  mapToDatabase(attendance: Omit<Attendance, 'id'>): Omit<DatabaseAttendance, 'id' | 'created_at'> {
    return {
      staff_id: attendance.staffId,
      date: attendance.date,
      status: attendance.status,
      attendance_value: attendance.attendanceValue,
      is_sunday: isSunday(attendance.date),
      is_part_time: attendance.isPartTime || false,
      staff_name: attendance.staffName,
      shift: attendance.shift,
      location: attendance.location,
      salary: attendance.salary,
      salary_override: attendance.salaryOverride,
      arrival_time: attendance.arrivalTime,
      leaving_time: attendance.leavingTime,
      is_uninformed: attendance.isUninformed || false
    };
  }
};
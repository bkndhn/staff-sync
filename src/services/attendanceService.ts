import { supabase } from '../lib/supabase';
import { Attendance } from '../types';
import type { DatabaseAttendance } from '../lib/supabase';
import { isSunday } from '../utils/salaryCalculations';

export const attendanceService = {
  async getAll(): Promise<Attendance[]> {
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

  async upsert(attendance: Omit<Attendance, 'id'>): Promise<Attendance> {
    const dbAttendance = this.mapToDatabase(attendance);

    const { data, error } = await supabase
      .from('attendance')
      .upsert([dbAttendance as any], {
        onConflict: 'staff_id,date,is_part_time'
      })
      .select()
      .single();

    if (error) {
      console.error('Error upserting attendance:', error);
      throw error;
    }

    return this.mapFromDatabase(data as any);
  },

  async bulkUpsert(attendanceRecords: Omit<Attendance, 'id'>[]): Promise<Attendance[]> {
    const dbRecords = attendanceRecords.map(this.mapToDatabase);

    const { data, error } = await supabase
      .from('attendance')
      .upsert(dbRecords as any[], {
        onConflict: 'staff_id,date,is_part_time'
      })
      .select();

    if (error) {
      console.error('Error bulk upserting attendance:', error);
      throw error;
    }

    return data.map((d: any) => this.mapFromDatabase(d));
  },

  async delete(id: string): Promise<{ error: any }> {
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
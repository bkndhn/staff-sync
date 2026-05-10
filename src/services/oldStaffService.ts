import { supabase } from '../lib/supabase';
import { OldStaffRecord } from '../types';
import type { DatabaseOldStaffRecord } from '../lib/supabase';

export const oldStaffService = {
  async getAll(): Promise<OldStaffRecord[]> {
    const { data, error } = await supabase
      .from('old_staff_records')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching old staff records:', error);
      throw error;
    }

    return data.map((d: any) => this.mapFromDatabase(d));
  },

  async create(record: Omit<OldStaffRecord, 'id'>): Promise<OldStaffRecord> {
    const dbRecord = this.mapToDatabase(record);

    const { data, error } = await supabase
      .from('old_staff_records')
      .insert([dbRecord as any])
      .select()
      .single();

    if (error) {
      console.error('Error creating old staff record:', error);
      throw error;
    }

    return this.mapFromDatabase(data as any);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('old_staff_records')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting old staff record:', error);
      throw error;
    }
  },

  mapFromDatabase(dbRecord: any): OldStaffRecord {
    return {
      id: dbRecord.id,
      originalStaffId: dbRecord.original_staff_id,
      name: dbRecord.name,
      location: dbRecord.location as 'Big Shop' | 'Small Shop' | 'Godown',
      type: dbRecord.type as 'full-time' | 'part-time',
      experience: dbRecord.experience,
      basicSalary: dbRecord.basic_salary,
      incentive: dbRecord.incentive,
      hra: dbRecord.hra,
      totalSalary: dbRecord.total_salary,
      joinedDate: dbRecord.joined_date,
      leftDate: dbRecord.left_date,
      reason: dbRecord.reason,
      salaryHistory: [],
      totalAdvanceOutstanding: dbRecord.total_advance_outstanding,
      lastAdvanceData: dbRecord.last_advance_data,
      contactNumber: dbRecord.contact_number ?? undefined,
      address: dbRecord.address ?? undefined,
      photo: dbRecord.photo_url ?? undefined
    };
  },

  mapToDatabase(record: Omit<OldStaffRecord, 'id'>): Omit<DatabaseOldStaffRecord, 'id' | 'created_at'> {
    return {
      original_staff_id: record.originalStaffId,
      name: record.name,
      location: record.location,
      type: record.type,
      experience: record.experience,
      basic_salary: record.basicSalary,
      incentive: record.incentive,
      hra: record.hra,
      total_salary: record.totalSalary,
      joined_date: record.joinedDate,
      left_date: record.leftDate,
      reason: record.reason,
      total_advance_outstanding: record.totalAdvanceOutstanding,
      last_advance_data: record.lastAdvanceData,
      contact_number: record.contactNumber,
      address: record.address,
      photo_url: record.photo
    };
  }
};
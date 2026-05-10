import { supabase } from '../lib/supabase';
import { SalaryHike } from '../types';

export interface DatabaseSalaryHike {
  id: string;
  staff_id: string;
  old_salary: number;
  new_salary: number;
  hike_date: string;
  reason?: string;
  breakdown?: Record<string, number>;
  created_at: string;
}

export const salaryHikeService = {
  async getAll(): Promise<SalaryHike[]> {
    const { data, error } = await supabase
      .from('salary_hikes')
      .select('*')
      .order('hike_date', { ascending: false });

    if (error) {
      console.error('Error fetching salary hikes:', error);
      throw error;
    }

    return data.map((d: any) => this.mapFromDatabase(d));
  },

  async getByStaffId(staffId: string): Promise<SalaryHike[]> {
    const { data, error } = await supabase
      .from('salary_hikes')
      .select('*')
      .eq('staff_id', staffId)
      .order('hike_date', { ascending: false });

    if (error) {
      console.error('Error fetching salary hikes for staff:', error);
      throw error;
    }

    return data.map((d: any) => this.mapFromDatabase(d));
  },

  async getPreviousSalary(staffId: string, cutoffDate: string = '2024-10-01'): Promise<{ previousSalary: number | null, changeDate: string | null }> {
    const { data, error } = await supabase
      .from('salary_hikes')
      .select('new_salary, hike_date')
      .eq('staff_id', staffId)
      .lt('hike_date', cutoffDate)
      .order('hike_date', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching previous salary:', error);
      return { previousSalary: null, changeDate: null };
    }

    if (data && data.length > 0) {
      return {
        previousSalary: data[0].new_salary,
        changeDate: data[0].hike_date
      };
    }

    return { previousSalary: null, changeDate: null };
  },

  async create(hike: Omit<SalaryHike, 'id' | 'createdAt'>): Promise<SalaryHike> {
    const dbHike = this.mapToDatabase(hike);

    const { data, error } = await supabase
      .from('salary_hikes')
      .insert([dbHike])
      .select()
      .single();

    if (error) {
      console.error('Error creating salary hike:', error);
      throw error;
    }

    return this.mapFromDatabase(data as any);
  },

  async update(id: string, updates: Partial<SalaryHike>): Promise<SalaryHike> {
    const dbUpdates: Partial<DatabaseSalaryHike> = {};
    if (updates.oldSalary !== undefined) dbUpdates.old_salary = updates.oldSalary;
    if (updates.newSalary !== undefined) dbUpdates.new_salary = updates.newSalary;
    if (updates.hikeDate !== undefined) dbUpdates.hike_date = updates.hikeDate;
    if (updates.reason !== undefined) dbUpdates.reason = updates.reason;
    if (updates.breakdown !== undefined) dbUpdates.breakdown = updates.breakdown;

    const { data, error } = await supabase
      .from('salary_hikes')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating salary hike:', error);
      throw error;
    }

    return this.mapFromDatabase(data as any);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('salary_hikes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting salary hike:', error);
      throw error;
    }
  },

  mapFromDatabase(dbHike: DatabaseSalaryHike): SalaryHike {
    return {
      id: dbHike.id,
      staffId: dbHike.staff_id,
      oldSalary: dbHike.old_salary,
      newSalary: dbHike.new_salary,
      hikeDate: dbHike.hike_date,
      reason: dbHike.reason,
      breakdown: dbHike.breakdown,
      createdAt: dbHike.created_at
    };
  },

  mapToDatabase(hike: Omit<SalaryHike, 'id' | 'createdAt'>): Omit<DatabaseSalaryHike, 'id' | 'created_at'> {
    return {
      staff_id: hike.staffId,
      old_salary: hike.oldSalary,
      new_salary: hike.newSalary,
      hike_date: hike.hikeDate,
      reason: hike.reason,
      breakdown: hike.breakdown
    };
  }
};
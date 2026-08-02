import { supabase } from '../lib/supabase';
import { dataApi } from '../lib/dataApi';

export interface AdvanceEntry {
  id: string;
  staffId: string;
  entryDate: string;
  amount: number;
  purpose?: string;
  month: number;
  year: number;
  deductPeriods?: number;
  startDeductMonth?: number;
  startDeductYear?: number;
  totalDeducted?: number;
  createdAt?: string;
  updatedAt?: string;
}

export const advanceEntryService = {
  async getByStaff(staffId: string): Promise<AdvanceEntry[]> {
    const { data, error } = await dataApi
      .from('advance_entries')
      .select('*')
      .eq('staff_id', staffId)
      .order('entry_date', { ascending: true });

    if (error) {
      console.error('Error fetching advance entries:', error);
      return [];
    }
    return (data || []).map(this.mapFromDatabase);
  },

  async getByStaffAndMonth(staffId: string, month: number, year: number): Promise<AdvanceEntry[]> {
    const { data, error } = await dataApi
      .from('advance_entries')
      .select('*')
      .eq('staff_id', staffId)
      .eq('month', month)
      .eq('year', year)
      .order('entry_date', { ascending: true });

    if (error) {
      console.error('Error fetching advance entries:', error);
      return [];
    }
    return (data || []).map(this.mapFromDatabase);
  },

  async create(entry: Omit<AdvanceEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<AdvanceEntry | null> {
    const { data, error } = await dataApi
      .from('advance_entries')
      .insert({
        staff_id: entry.staffId,
        entry_date: entry.entryDate,
        amount: entry.amount,
        purpose: entry.purpose || null,
        month: entry.month,
        year: entry.year,
        deduct_periods: entry.deductPeriods ?? 1,
        start_deduct_month: entry.startDeductMonth ?? entry.month,
        start_deduct_year: entry.startDeductYear ?? entry.year,
        total_deducted: entry.totalDeducted ?? 0
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating advance entry:', error);
      return null;
    }
    return this.mapFromDatabase(data);
  },

  async update(id: string, updates: Partial<Pick<AdvanceEntry, 'entryDate' | 'amount' | 'purpose' | 'deductPeriods' | 'startDeductMonth' | 'startDeductYear' | 'totalDeducted'>>): Promise<AdvanceEntry | null> {
    const payload: any = {};
    if (updates.entryDate !== undefined) {
      payload.entry_date = updates.entryDate;
      const d = new Date(updates.entryDate);
      payload.month = d.getMonth();
      payload.year = d.getFullYear();
    }
    if (updates.amount !== undefined) payload.amount = updates.amount;
    if (updates.purpose !== undefined) payload.purpose = updates.purpose || null;
    if (updates.deductPeriods !== undefined) payload.deduct_periods = updates.deductPeriods;
    if (updates.startDeductMonth !== undefined) payload.start_deduct_month = updates.startDeductMonth;
    if (updates.startDeductYear !== undefined) payload.start_deduct_year = updates.startDeductYear;
    if (updates.totalDeducted !== undefined) payload.total_deducted = updates.totalDeducted;
    payload.updated_at = new Date().toISOString();

    const { data, error } = await dataApi
      .from('advance_entries')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating advance entry:', error);
      return null;
    }
    return this.mapFromDatabase(data);
  },

  async delete(id: string): Promise<boolean> {
    const { error } = await dataApi
      .from('advance_entries')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting advance entry:', error);
      return false;
    }
    return true;
  },

  mapFromDatabase(row: any): AdvanceEntry {
    return {
      id: row.id,
      staffId: row.staff_id,
      entryDate: row.entry_date,
      amount: Number(row.amount),
      purpose: row.purpose ?? undefined,
      month: row.month,
      year: row.year,
      deductPeriods: row.deduct_periods ?? undefined,
      startDeductMonth: row.start_deduct_month ?? undefined,
      startDeductYear: row.start_deduct_year ?? undefined,
      totalDeducted: row.total_deducted != null ? Number(row.total_deducted) : undefined,
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
    };
  },

  async updateTotalDeducted(id: string, newTotal: number): Promise<AdvanceEntry | null> {
    const { data, error } = await dataApi
      .from('advance_entries')
      .update({
        total_deducted: newTotal,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating total_deducted:', error);
      return null;
    }
    return this.mapFromDatabase(data);
  },

  async getActiveForMonth(month: number, year: number): Promise<AdvanceEntry[]> {
    const { data, error } = await dataApi
      .from('advance_entries')
      .select('*')
      .order('entry_date', { ascending: true });

    if (error) {
      console.error('Error fetching active advance entries:', error);
      return [];
    }

    const allEntries = (data || []).map(this.mapFromDatabase);

    return allEntries.filter(entry => {
      const totalDeducted = entry.totalDeducted || 0;
      if (totalDeducted >= entry.amount) return false; // fully paid

      const startMonth = entry.startDeductMonth ?? entry.month;
      const startYear = entry.startDeductYear ?? entry.year;
      const periodsElapsed = (year - startYear) * 12 + (month - startMonth);

      return periodsElapsed >= 0;
    });
  }
};


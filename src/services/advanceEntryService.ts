import { supabase } from '../lib/supabase';

export interface AdvanceEntry {
  id: string;
  staffId: string;
  entryDate: string;
  amount: number;
  purpose?: string;
  month: number;
  year: number;
  createdAt?: string;
  updatedAt?: string;
}

export const advanceEntryService = {
  async getByStaffAndMonth(staffId: string, month: number, year: number): Promise<AdvanceEntry[]> {
    const { data, error } = await supabase
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
    const { data, error } = await supabase
      .from('advance_entries')
      .insert({
        staff_id: entry.staffId,
        entry_date: entry.entryDate,
        amount: entry.amount,
        purpose: entry.purpose || null,
        month: entry.month,
        year: entry.year
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating advance entry:', error);
      return null;
    }
    return this.mapFromDatabase(data);
  },

  async update(id: string, updates: Partial<Pick<AdvanceEntry, 'entryDate' | 'amount' | 'purpose'>>): Promise<AdvanceEntry | null> {
    const payload: any = {};
    if (updates.entryDate !== undefined) payload.entry_date = updates.entryDate;
    if (updates.amount !== undefined) payload.amount = updates.amount;
    if (updates.purpose !== undefined) payload.purpose = updates.purpose || null;
    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabase
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
    const { error } = await supabase
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
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
    };
  }
};

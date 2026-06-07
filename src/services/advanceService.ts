import { supabase } from '../lib/supabase';
import { AdvanceDeduction } from '../types';
import type { DatabaseAdvance } from '../lib/supabase';

export const advanceService = {
  async getAll(): Promise<AdvanceDeduction[]> {
    const { data, error } = await supabase
      .from('advances')
      .select('*')
      .order('year', { ascending: false })
      .order('month', { ascending: false });

    if (error) {
      console.error('Error fetching advances:', error);
      throw error;
    }

    return data.map((d: any) => this.mapFromDatabase(d));
  },

  async getByStaffAndMonth(staffId: string, month: number, year: number): Promise<AdvanceDeduction | null> {
    const { data, error } = await supabase
      .from('advances')
      .select('*')
      .eq('staff_id', staffId)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();

    if (error) {
      console.error('Error fetching advance:', error);
      throw error;
    }

    return data ? this.mapFromDatabase(data as any) : null;
  },

  async getPreviousMonthAdvance(staffId: string, currentMonth: number, currentYear: number): Promise<number> {
    let prevMonth = currentMonth - 1;
    let prevYear = currentYear;
    
    if (prevMonth < 0) {
      prevMonth = 11;
      prevYear = currentYear - 1;
    }

    const previousAdvance = await this.getByStaffAndMonth(staffId, prevMonth, prevYear);
    return previousAdvance?.newAdvance || 0;
  },

  async upsert(advance: Omit<AdvanceDeduction, 'id' | 'createdAt' | 'updatedAt'>): Promise<AdvanceDeduction> {
    const dbAdvance = this.mapToDatabase(advance);
    
    const { data, error } = await supabase
      .from('advances')
      .upsert([dbAdvance as any], {
        onConflict: 'staff_id,month,year'
      })
      .select()
      .single();

    if (error) {
      console.error('Error upserting advance:', error);
      throw error;
    }

    return this.mapFromDatabase(data as any);
  },

  mapFromDatabase(dbAdvance: any): AdvanceDeduction {
    let notes = dbAdvance.notes || '';
    let overrides = undefined;
    const jsonMatch = notes.match(/\[JSON\](.*?)\[\/JSON\]/);
    if (jsonMatch) {
      try {
        overrides = JSON.parse(jsonMatch[1]);
        notes = notes.replace(jsonMatch[0], '').trim();
      } catch (e) {
        console.error('Failed to parse overrides from notes:', e);
      }
    }

    return {
      id: dbAdvance.id,
      staffId: dbAdvance.staff_id,
      month: dbAdvance.month,
      year: dbAdvance.year,
      oldAdvance: dbAdvance.old_advance,
      currentAdvance: dbAdvance.current_advance,
      deduction: dbAdvance.deduction,
      newAdvance: dbAdvance.new_advance,
      notes: notes || undefined,
      overrides: overrides,
      createdAt: dbAdvance.created_at ?? undefined,
      updatedAt: dbAdvance.updated_at ?? undefined
    };
  },

  mapToDatabase(advance: Omit<AdvanceDeduction, 'id' | 'createdAt' | 'updatedAt'>): Omit<DatabaseAdvance, 'id' | 'created_at' | 'updated_at'> {
    let finalNotes = advance.notes || '';
    if (advance.overrides && Object.keys(advance.overrides).length > 0) {
      finalNotes = `[JSON]${JSON.stringify(advance.overrides)}[/JSON] ` + finalNotes;
    }

    return {
      staff_id: advance.staffId,
      month: advance.month,
      year: advance.year,
      old_advance: advance.oldAdvance,
      current_advance: advance.currentAdvance,
      deduction: advance.deduction,
      new_advance: advance.newAdvance,
      notes: finalNotes || undefined
    };
  }
};
import { dataApi } from '../lib/dataApi';

export interface PettyCashSheet {
  id?: string;
  tenant_id?: string;
  location: string;
  date: string;
  template_type: 'shop' | 'godown';
  received_amount: number;
  full_time_meal_total?: number;
  part_time_meal_total?: number;
  meal_total?: number;
  expenses_total?: number;
  transport_total?: number;
  total_expense?: number;
  balance?: number;
  status?: 'draft' | 'submitted' | 'verified' | 'settled';
  created_at?: string;
  updated_at?: string;
  
  // Nested relations
  staff_meals: StaffMeal[];
  expenses: CustomExpense[];
  transport_logistics: TransportLogistics[];
}

export interface StaffMeal {
  id?: string;
  sheet_id?: string;
  staff_id: string;
  staff_name: string;
  designation: string;
  staff_type: 'full-time' | 'part-time';
  attendance_status: string; // 'F', 'H', 'H1', 'H2'
  amount: number;
  display_order?: number;
}

export interface CustomExpense {
  id?: string;
  sheet_id?: string;
  category: string; // 'fixed' | 'custom'
  label: string;
  amount: number;
  notes?: string;
  display_order?: number;
}

export interface TransportLogistics {
  id?: string;
  sheet_id?: string;
  transport_name: string;
  count: number | string;
  freight: number;
  auto: number;
  hamali: number;
  total: number;
  display_order?: number;
}

export const pettyCashService = {
  async getSheet(location: string, date: string): Promise<PettyCashSheet | null> {
    const { data, error } = await dataApi
      .from('petty_cash_sheets')
      .select('*')
      .eq('location', location)
      .eq('date', date)
      .maybeSingle();

    if (error || !data) return null;
    const sheet = data as any;

    const [mealsRes, expsRes, transRes] = await Promise.all([
      dataApi.from('petty_cash_staff_meals').select('*').eq('sheet_id', sheet.id).order('display_order', { ascending: true }),
      dataApi.from('petty_cash_expenses').select('*').eq('sheet_id', sheet.id).order('display_order', { ascending: true }),
      dataApi.from('petty_cash_transports').select('*').eq('sheet_id', sheet.id).order('display_order', { ascending: true }),
    ]);

    return {
      ...sheet,
      staff_meals: (mealsRes.data as StaffMeal[]) || [],
      expenses: (expsRes.data as CustomExpense[]) || [],
      transport_logistics: (transRes.data as TransportLogistics[]) || [],
    };
  },

  async saveSheet(sheet: PettyCashSheet): Promise<PettyCashSheet> {
    let sheetId = sheet.id;

    const sheetData = {
      location: sheet.location,
      date: sheet.date,
      template_type: sheet.template_type,
      received_amount: sheet.received_amount || 0,
      full_time_meal_total: sheet.full_time_meal_total || 0,
      part_time_meal_total: sheet.part_time_meal_total || 0,
      meal_total: sheet.meal_total || 0,
      expenses_total: sheet.expenses_total || 0,
      transport_total: sheet.transport_total || 0,
      total_expense: sheet.total_expense || 0,
      balance: sheet.balance || 0,
      status: sheet.status || 'draft',
      updated_at: new Date().toISOString(),
    };

    if (sheetId) {
      const { error } = await dataApi
        .from('petty_cash_sheets')
        .update(sheetData)
        .eq('id', sheetId);

      if (error) {
        console.error('Error updating petty_cash_sheets:', error);
        throw error;
      }

      await Promise.all([
        dataApi.from('petty_cash_staff_meals').delete().eq('sheet_id', sheetId),
        dataApi.from('petty_cash_expenses').delete().eq('sheet_id', sheetId),
        dataApi.from('petty_cash_transports').delete().eq('sheet_id', sheetId),
      ]);
    } else {
      const { data, error } = await dataApi
        .from('petty_cash_sheets')
        .insert(sheetData)
        .select()
        .single();

      if (error || !data) {
        console.error('Error inserting petty_cash_sheets:', error);
        throw error || new Error('Failed to create sheet');
      }
      sheetId = (data as any).id;
    }

    if (sheet.staff_meals && sheet.staff_meals.length > 0) {
      const mealsToInsert = sheet.staff_meals.map((m, idx) => ({
        sheet_id: sheetId,
        staff_id: m.staff_id,
        staff_name: m.staff_name,
        designation: m.designation,
        staff_type: m.staff_type,
        attendance_status: m.attendance_status,
        amount: m.amount,
        display_order: idx,
      }));
      await dataApi.from('petty_cash_staff_meals').insert(mealsToInsert);
    }

    if (sheet.expenses && sheet.expenses.length > 0) {
      const expsToInsert = sheet.expenses.map((e, idx) => ({
        sheet_id: sheetId,
        category: e.category,
        label: e.label,
        amount: e.amount,
        notes: e.notes || null,
        display_order: idx,
      }));
      await dataApi.from('petty_cash_expenses').insert(expsToInsert);
    }

    if (sheet.transport_logistics && sheet.transport_logistics.length > 0) {
      const transToInsert = sheet.transport_logistics.map((t, idx) => ({
        sheet_id: sheetId,
        transport_name: t.transport_name,
        count: Number(t.count) || 0,
        freight: t.freight,
        auto: t.auto,
        hamali: t.hamali,
        total: t.total,
        display_order: idx,
      }));
      await dataApi.from('petty_cash_transports').insert(transToInsert);
    }

    const updated = await this.getSheet(sheet.location, sheet.date);
    return updated || sheet;
  }
};

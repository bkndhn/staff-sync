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
    const res = await dataApi.query({
      table: 'petty_cash_sheets',
      filters: [
        { col: 'location', op: 'eq', val: location },
        { col: 'date', op: 'eq', val: date }
      ]
    });
    
    if (!res || res.length === 0) return null;
    
    const sheet = res[0] as any;
    
    // Fetch relations
    const [meals, exps, trans] = await Promise.all([
      dataApi.query({ table: 'petty_cash_staff_meals', filters: [{ col: 'sheet_id', op: 'eq', val: sheet.id }], order: { col: 'display_order', ascending: true } }),
      dataApi.query({ table: 'petty_cash_expenses', filters: [{ col: 'sheet_id', op: 'eq', val: sheet.id }], order: { col: 'display_order', ascending: true } }),
      dataApi.query({ table: 'petty_cash_transports', filters: [{ col: 'sheet_id', op: 'eq', val: sheet.id }], order: { col: 'display_order', ascending: true } })
    ]);
    
    return {
      ...sheet,
      staff_meals: meals || [],
      expenses: exps || [],
      transport_logistics: trans || []
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
      updated_at: new Date().toISOString()
    };

    if (sheetId) {
      // Update
      await dataApi.mutate({
        table: 'petty_cash_sheets',
        op: 'update',
        filters: [{ col: 'id', op: 'eq', val: sheetId }],
        values: sheetData
      });
      
      // Delete existing relations to replace them
      await dataApi.mutate({ table: 'petty_cash_staff_meals', op: 'delete', filters: [{ col: 'sheet_id', op: 'eq', val: sheetId }] });
      await dataApi.mutate({ table: 'petty_cash_expenses', op: 'delete', filters: [{ col: 'sheet_id', op: 'eq', val: sheetId }] });
      await dataApi.mutate({ table: 'petty_cash_transports', op: 'delete', filters: [{ col: 'sheet_id', op: 'eq', val: sheetId }] });
      
    } else {
      // Insert
      const res = await dataApi.mutate({
        table: 'petty_cash_sheets',
        op: 'insert',
        values: sheetData
      });
      sheetId = res[0].id;
    }
    
    // Insert new relations
    if (sheet.staff_meals.length > 0) {
      const mealsToInsert = sheet.staff_meals.map((m, idx) => ({
        sheet_id: sheetId,
        staff_id: m.staff_id,
        staff_name: m.staff_name,
        designation: m.designation,
        staff_type: m.staff_type,
        attendance_status: m.attendance_status,
        amount: m.amount,
        display_order: idx
      }));
      await dataApi.mutate({ table: 'petty_cash_staff_meals', op: 'insert', values: mealsToInsert });
    }
    
    if (sheet.expenses.length > 0) {
      const expsToInsert = sheet.expenses.map((e, idx) => ({
        sheet_id: sheetId,
        category: e.category,
        label: e.label,
        amount: e.amount,
        notes: e.notes || null,
        display_order: idx
      }));
      await dataApi.mutate({ table: 'petty_cash_expenses', op: 'insert', values: expsToInsert });
    }
    
    if (sheet.transport_logistics.length > 0) {
      const transToInsert = sheet.transport_logistics.map((t, idx) => ({
        sheet_id: sheetId,
        transport_name: t.transport_name,
        count: Number(t.count) || 0,
        freight: t.freight,
        auto: t.auto,
        hamali: t.hamali,
        total: t.total,
        display_order: idx
      }));
      await dataApi.mutate({ table: 'petty_cash_transports', op: 'insert', values: transToInsert });
    }
    
    // Return updated sheet
    return this.getSheet(sheet.location, sheet.date) as Promise<PettyCashSheet>;
  }
};

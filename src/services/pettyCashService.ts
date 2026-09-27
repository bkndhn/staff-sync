import { dataApi } from '../lib/dataApi';

export interface PettyCashSheet {
  id?: string;
  tenant_id?: string;
  location: string;
  date: string;
  template_type: 'shop' | 'godown';
  total_received: number;
  staff_meals: StaffMeal[];
  expenses: CustomExpense[];
  transport_logistics: TransportLogistics[];
  created_at?: string;
  updated_at?: string;
}

export interface StaffMeal {
  staff_id: string;
  name: string;
  designation: string;
  type: 'full-time' | 'part-time';
  attendance_status: string; // 'F', 'H', 'H1', 'H2'
  amount: number;
}

export interface CustomExpense {
  id: string;
  particulars: string;
  amount: number;
  is_fixed?: boolean;
}

export interface TransportLogistics {
  id: string;
  transport: string;
  count: string;
  freight: number;
  auto: number;
  hamali: number;
  total: number;
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
    return res && res.length > 0 ? res[0] as PettyCashSheet : null;
  },

  async saveSheet(sheet: PettyCashSheet): Promise<PettyCashSheet> {
    if (sheet.id) {
      // Update
      const res = await dataApi.mutate({
        table: 'petty_cash_sheets',
        op: 'update',
        filters: [{ col: 'id', op: 'eq', val: sheet.id }],
        values: {
          template_type: sheet.template_type,
          total_received: sheet.total_received,
          staff_meals: sheet.staff_meals,
          expenses: sheet.expenses,
          transport_logistics: sheet.transport_logistics,
          updated_at: new Date().toISOString()
        }
      });
      return res[0] as PettyCashSheet;
    } else {
      // Insert
      const res = await dataApi.mutate({
        table: 'petty_cash_sheets',
        op: 'insert',
        values: sheet
      });
      return res[0] as PettyCashSheet;
    }
  }
};

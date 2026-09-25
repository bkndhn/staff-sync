import { dataApi } from '../lib/dataApi';

export type ExpenseCategory = 'travel' | 'meals' | 'fuel' | 'supplies' | 'other';
export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'paid';

export interface ExpenseClaim {
  id: string;
  staffId: string;
  staffName?: string;
  location?: string;
  claimDate: string;
  category: ExpenseCategory;
  amount: number;
  description?: string;
  receiptUrl?: string;
  status: ExpenseStatus;
  reviewedBy?: string;
  reviewNotes?: string;
  reviewedAt?: string;
  paidMonth?: number;
  paidYear?: number;
  createdAt: string;
  updatedAt: string;
}

export const EXPENSE_CATEGORIES: { key: ExpenseCategory; label: string }[] = [
  { key: 'travel', label: 'Travel' },
  { key: 'meals', label: 'Meals' },
  { key: 'fuel', label: 'Fuel' },
  { key: 'supplies', label: 'Supplies' },
  { key: 'other', label: 'Other' },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRow = (row: any): ExpenseClaim => ({
  id: row.id,
  staffId: row.staff_id,
  staffName: row.staff_name || undefined,
  location: row.location || undefined,
  claimDate: row.claim_date,
  category: (row.category || 'other') as ExpenseCategory,
  amount: Number(row.amount) || 0,
  description: row.description || undefined,
  receiptUrl: row.receipt_url || undefined,
  status: (row.status || 'pending') as ExpenseStatus,
  reviewedBy: row.reviewed_by || undefined,
  reviewNotes: row.review_notes || undefined,
  reviewedAt: row.reviewed_at || undefined,
  paidMonth: row.paid_month ?? undefined,
  paidYear: row.paid_year ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const expenseClaimService = {
  async listByStaffId(staffId: string): Promise<ExpenseClaim[]> {
    const { data, error } = await dataApi
      .from('expense_claims')
      .select('*')
      .eq('staff_id', staffId)
      .order('claim_date', { ascending: false });
    if (error) {
      console.error('Error loading expense claims:', error);
      return [];
    }
    return (data || []).map(mapRow);
  },

  async listAll(): Promise<ExpenseClaim[]> {
    const { data, error } = await dataApi
      .from('expense_claims')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Error loading expense claims:', error);
      return [];
    }
    return (data || []).map(mapRow);
  },

  async listApprovedUnpaid(): Promise<ExpenseClaim[]> {
    const { data, error } = await dataApi
      .from('expense_claims')
      .select('*')
      .eq('status', 'approved')
      .order('claim_date', { ascending: true });
    if (error) {
      console.error('Error loading approved expense claims:', error);
      return [];
    }
    return (data || []).map(mapRow);
  },

  async create(input: {
    staffId: string;
    staffName?: string;
    location?: string;
    claimDate: string;
    category: ExpenseCategory;
    amount: number;
    description?: string;
    receiptUrl?: string;
  }): Promise<boolean> {
    const { error } = await dataApi.from('expense_claims').insert({
      staff_id: input.staffId,
      staff_name: input.staffName ?? null,
      location: input.location ?? null,
      claim_date: input.claimDate,
      category: input.category,
      amount: input.amount,
      description: input.description ?? null,
      receipt_url: input.receiptUrl ?? null,
      status: 'pending',
    });
    if (error) {
      console.error('Error creating expense claim:', error);
      return false;
    }
    return true;
  },

  async review(
    id: string,
    status: Extract<ExpenseStatus, 'approved' | 'rejected'>,
    reviewedBy: string,
    reviewNotes?: string,
  ): Promise<boolean> {
    const { error } = await dataApi
      .from('expense_claims')
      .update({
        status,
        reviewed_by: reviewedBy,
        review_notes: reviewNotes ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) {
      console.error('Error reviewing expense claim:', error);
      return false;
    }
    return true;
  },

  async markPaid(id: string, month: number, year: number): Promise<boolean> {
    const { error } = await dataApi
      .from('expense_claims')
      .update({ status: 'paid', paid_month: month, paid_year: year })
      .eq('id', id);
    if (error) {
      console.error('Error marking expense claim paid:', error);
      return false;
    }
    return true;
  },

  async remove(id: string): Promise<boolean> {
    const { error } = await dataApi.from('expense_claims').delete().eq('id', id);
    if (error) {
      console.error('Error deleting expense claim:', error);
      return false;
    }
    return true;
  },
};

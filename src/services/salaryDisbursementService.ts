import { dataApi } from '../lib/dataApi';
import { supabase } from '../lib/supabase';

export interface PayrollDisbursement {
  id: string;
  staffId: string;
  monthYear: string;
  amount: number;
  paymentMode: string;
  transactionRef?: string;
  notes?: string;
  disbursedAt: string;
}

export type SalaryDisbursement = PayrollDisbursement;

export const salaryDisbursementService = {
  async getByStaffId(staffId: string): Promise<SalaryDisbursement[]> {
    const { data, error } = await dataApi
      .from('salary_disbursements')
      .select('*')
      .eq('staff_id', staffId)
      .order('disbursed_at', { ascending: false });

    if (error) {
      console.error('Error fetching salary disbursements:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      staffId: row.staff_id,
      monthYear: row.month_year,
      amount: row.amount,
      paymentMode: row.payment_mode,
      transactionRef: row.transaction_ref,
      notes: row.notes,
      disbursedAt: row.disbursed_at
    }));
  },

  async markAsPaidAndNotify(
    staffId: string, 
    monthYear: string, 
    amount: number, 
    paymentMode: string, 
    transactionRef?: string,
    notes?: string
  ): Promise<boolean> {
    const { error } = await dataApi
      .from('salary_disbursements')
      .insert({
        staff_id: staffId,
        month_year: monthYear,
        amount,
        payment_mode: paymentMode,
        transaction_ref: transactionRef || null,
        notes: notes || null
      });

    if (error) {
      console.error('Error marking salary as paid:', error);
      return false;
    }

    // Try to trigger the push notification function
    try {
      await supabase.functions.invoke('send-notification', {
        body: {
          staffId,
          title: 'Payroll Credited! 💸',
          body: `Your salary of ₹${amount} for ${monthYear} has been credited via ${paymentMode.toUpperCase()}.`
        }
      });
    } catch (err) {
      console.warn('Failed to send push notification', err);
    }

    return true;
  }
};

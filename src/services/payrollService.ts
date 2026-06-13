import { supabase } from '../lib/supabase';
import { PayrollRun, PayrollSnapshot, Staff, SalaryDetail } from '../types';

export const payrollService = {
  // Get a payroll run by month and year
  async getPayrollRun(month: number, year: number): Promise<PayrollRun | null> {
    const { data, error } = await supabase
      .from('payroll_runs')
      .select('*')
      .eq('month', month)
      .eq('year', year)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('Error fetching payroll run:', error);
      throw error;
    }

    return {
      id: data.id,
      month: data.month,
      year: data.year,
      status: data.status as 'Generated' | 'Locked',
      generatedAt: data.generated_at || '',
      generatedBy: data.generated_by || undefined
    };
  },

  // Get snapshots for a specific run
  async getSnapshots(runId: string): Promise<PayrollSnapshot[]> {
    const { data, error } = await supabase
      .from('payroll_snapshots')
      .select('*')
      .eq('run_id', runId);

    if (error) {
      console.error('Error fetching payroll snapshots:', error);
      throw error;
    }

    return data.map((row: any) => ({
      id: row.id,
      runId: row.run_id,
      staffId: row.staff_id,
      staffSnapshot: row.staff_snapshot as Staff,
      salaryDetail: row.salary_detail as SalaryDetail
    }));
  },

  // Generate payroll for a month/year
  async generatePayroll(
    month: number, 
    year: number, 
    staff: Staff[], 
    salaryDetails: SalaryDetail[],
    userEmail?: string
  ): Promise<PayrollRun> {
    // 1. Create the run
    const { data: runData, error: runError } = await supabase
      .from('payroll_runs')
      .insert({
        month,
        year,
        status: 'Generated',
        generated_by: userEmail
      })
      .select()
      .single();

    if (runError) {
      console.error('Error creating payroll run:', runError);
      throw runError;
    }

    const runId = runData.id;

    // 2. Prepare snapshots
    const snapshots = salaryDetails.map(detail => {
      const staffMember = staff.find(s => s.id === detail.staffId);
      if (!staffMember) throw new Error(`Staff member not found for ID ${detail.staffId}`);
      
      return {
        run_id: runId,
        staff_id: detail.staffId,
        staff_snapshot: staffMember,
        salary_detail: detail
      };
    });

    // 3. Insert snapshots in chunks to avoid large payload issues
    const chunkSize = 50;
    for (let i = 0; i < snapshots.length; i += chunkSize) {
      const chunk = snapshots.slice(i, i + chunkSize);
      const { error: snapError } = await supabase
        .from('payroll_snapshots')
        .insert(chunk as any);

      if (snapError) {
        console.error('Error inserting payroll snapshots:', snapError);
        // Rollback attempt (not perfect without RPC transaction, but better than nothing)
        await supabase.from('payroll_runs').delete().eq('id', runId);
        throw snapError;
      }
    }

    return {
      id: runData.id,
      month: runData.month,
      year: runData.year,
      status: runData.status as 'Generated' | 'Locked',
      generatedAt: runData.generated_at || '',
      generatedBy: runData.generated_by || undefined
    };
  },

  // Regenerate payroll (Delete old, create new)
  async regeneratePayroll(
    month: number, 
    year: number, 
    staff: Staff[], 
    salaryDetails: SalaryDetail[],
    userEmail?: string
  ): Promise<PayrollRun> {
    const existingRun = await this.getPayrollRun(month, year);
    
    if (existingRun) {
      // Delete existing run (cascade deletes snapshots)
      const { error } = await supabase
        .from('payroll_runs')
        .delete()
        .eq('id', existingRun.id);
        
      if (error) {
        console.error('Error deleting old payroll run:', error);
        throw error;
      }
    }

    // Generate new
    return this.generatePayroll(month, year, staff, salaryDetails, userEmail);
  }
};

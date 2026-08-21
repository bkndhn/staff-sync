import { dataApi } from '../lib/dataApi';
import { PayrollRun, PayrollSnapshot, Staff, PayrollDetail } from '../types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRun = (row: any): PayrollRun => ({
  id: row.id,
  month: row.month,
  year: row.year,
  status: (row.status || 'Generated') as PayrollRun['status'],
  generatedAt: row.generated_at || '',
  generatedBy: row.generated_by || undefined,
  submittedBy: row.submitted_by ?? null,
  submittedAt: row.submitted_at ?? null,
  approvedBy: row.approved_by ?? null,
  approvedAt: row.approved_at ?? null,
  rejectedBy: row.rejected_by ?? null,
  rejectedAt: row.rejected_at ?? null,
  rejectionReason: row.rejection_reason ?? null,
  lockedAt: row.locked_at ?? null,
  totalNet: row.total_net ?? null,
  headcount: row.headcount ?? null,
});

/** A run in these states is frozen: no regeneration, no override edits. */
export const isRunFrozen = (run: PayrollRun | null | undefined): boolean =>
  !!run && (run.status === 'Approved' || run.status === 'Locked');

export const payrollService = {
  async getPayrollRun(month: number, year: number): Promise<PayrollRun | null> {
    const { data, error } = await dataApi
      .from('payroll_runs')
      .select('*')
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();

    if (error) {
      console.error('Error fetching payroll run:', error);
      return null;
    }
    if (!data) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return row ? mapRun(row) : null;
  },

  /** All runs for a year — used by the payroll analytics dashboard. */
  async getRunsForYear(year: number): Promise<PayrollRun[]> {
    const { data, error } = await dataApi
      .from('payroll_runs')
      .select('*')
      .eq('year', year)
      .order('month', { ascending: true });

    if (error) {
      console.error('Error fetching payroll runs:', error);
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data as any[]) || []).map(mapRun);
  },

  async getSnapshots(runId: string): Promise<PayrollSnapshot[]> {
    const { data, error } = await dataApi
      .from('payroll_snapshots')
      .select('*')
      .eq('run_id', runId);

    if (error) {
      console.error('Error fetching payroll snapshots:', error);
      return [];
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data as any[]) || []).map((row: any) => ({
      id: row.id,
      runId: row.run_id,
      staffId: row.staff_id,
      staffSnapshot: row.staff_snapshot as Staff,
      salaryDetail: row.salary_detail as PayrollDetail,
    }));
  },

  async getSnapshotForStaff(month: number, year: number, staffId: string): Promise<PayrollSnapshot | null> {
    const run = await this.getPayrollRun(month, year);
    if (!run) return null;

    const { data, error } = await dataApi
      .from('payroll_snapshots')
      .select('*')
      .eq('run_id', run.id)
      .eq('staff_id', staffId)
      .maybeSingle();

    if (error || !data) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: any = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      id: row.id,
      runId: row.run_id,
      staffId: row.staff_id,
      staffSnapshot: row.staff_snapshot as Staff,
      salaryDetail: row.salary_detail as PayrollDetail,
    };
  },

  async generatePayroll(
    month: number,
    year: number,
    staff: Staff[],
    salaryDetails: PayrollDetail[],
    userEmail?: string,
  ): Promise<PayrollRun> {
    const totalNet = salaryDetails.reduce((sum, d) => sum + (Number(d.netSalary) || 0), 0);

    const { data: runData, error: runError } = await dataApi
      .from('payroll_runs')
      .insert({
        month,
        year,
        status: 'Generated',
        generated_by: userEmail,
        total_net: totalNet,
        headcount: salaryDetails.length,
      });

    if (runError) throw runError;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runRow: any = Array.isArray(runData) ? runData[0] : runData;
    if (!runRow?.id) throw new Error('Payroll run could not be created');

    const runId = runRow.id;

    const snapshots = salaryDetails.map(detail => {
      const staffMember = staff.find(s => s.id === detail.staffId);
      if (!staffMember) throw new Error(`Staff member not found for ID ${detail.staffId}`);
      return {
        run_id: runId,
        staff_id: detail.staffId,
        staff_snapshot: staffMember,
        salary_detail: detail,
      };
    });

    const chunkSize = 50;
    for (let i = 0; i < snapshots.length; i += chunkSize) {
      const chunk = snapshots.slice(i, i + chunkSize);
      const { error: snapError } = await dataApi.from('payroll_snapshots').insert(chunk);
      if (snapError) {
        await dataApi.from('payroll_runs').delete().eq('id', runId);
        throw snapError;
      }
    }

    return mapRun(runRow);
  },

  async regeneratePayroll(
    month: number,
    year: number,
    staff: Staff[],
    salaryDetails: PayrollDetail[],
    userEmail?: string,
  ): Promise<PayrollRun> {
    const existingRun = await this.getPayrollRun(month, year);

    if (existingRun) {
      if (isRunFrozen(existingRun)) {
        throw new Error('This payroll run is approved and locked. It cannot be regenerated.');
      }
      const { error } = await dataApi.from('payroll_runs').delete().eq('id', existingRun.id);
      if (error) throw error;
    }

    return this.generatePayroll(month, year, staff, salaryDetails, userEmail);
  },

  // ── Maker–checker workflow ────────────────────────────────────────────────
  // The server (data-api) is the source of truth: it stamps the actor, blocks
  // self-approval, and rejects invalid state transitions. These helpers only
  // request the transition.
  async updateRunStatus(
    runId: string,
    status: PayrollRun['status'],
    extra: Record<string, unknown> = {},
  ): Promise<PayrollRun> {
    const { data, error } = await dataApi
      .from('payroll_runs')
      .update({ status, ...extra })
      .eq('id', runId);

    if (error) throw error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row: any = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('Payroll run status could not be updated');
    return mapRun(row);
  },

  /** Maker submits the generated run for review. */
  submitForApproval(runId: string) {
    return this.updateRunStatus(runId, 'PendingApproval');
  },

  /** Checker (a different admin) approves the run. */
  approveRun(runId: string) {
    return this.updateRunStatus(runId, 'Approved');
  },

  /** Checker sends the run back with a reason. */
  rejectRun(runId: string, reason: string) {
    return this.updateRunStatus(runId, 'Rejected', { rejection_reason: reason });
  },

  /** Final lock — payroll is released for disbursement and becomes immutable. */
  lockRun(runId: string) {
    return this.updateRunStatus(runId, 'Locked');
  },
};

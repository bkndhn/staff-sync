// Employee tax declarations: staff declare from the staff portal, managers approve,
// and approved ones feed payroll TDS for the current financial year.
import { dataApi } from '../lib/dataApi';
import { financialYearLabel, setApprovedTaxProfiles, type RuntimeTaxProfile, type TaxRegime } from '../utils/tdsCalculations';
import { hraExemption, profileFromDeclaration, type DeclarationItems } from '../utils/taxDeclarations';
import type { Staff } from '../types';

export type DeclarationStatus = 'Submitted' | 'Approved' | 'Rejected';

export interface TaxDeclaration {
  id?: string;
  staffId: string;
  fy: string;
  regime: TaxRegime;
  items: DeclarationItems;
  status?: DeclarationStatus;
  reviewNotes?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  updatedAt?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromRow = (r: any): TaxDeclaration => ({
  id: r.id, staffId: r.staff_id, fy: r.fy, regime: r.regime === 'old' ? 'old' : 'new',
  items: r.items || {}, status: r.status, reviewNotes: r.review_notes,
  reviewedBy: r.reviewed_by, reviewedAt: r.reviewed_at, updatedAt: r.updated_at,
});

export const currentFy = (d = new Date()) => financialYearLabel(d.getMonth(), d.getFullYear());

export const taxDeclarationService = {
  async mine(staffId: string, fy = currentFy()): Promise<TaxDeclaration | null> {
    const { data, error } = await dataApi.from('tax_declarations').select('*').eq('staff_id', staffId).eq('fy', fy);
    if (error) throw new Error(error.message || 'Could not load your declaration');
    const row = (data as unknown[] | null)?.[0];
    return row ? fromRow(row) : null;
  },

  async save(d: TaxDeclaration): Promise<void> {
    const row = { staff_id: d.staffId, fy: d.fy, regime: d.regime, items: d.items };
    const { error } = d.id
      ? await dataApi.from('tax_declarations').update(row).eq('id', d.id)
      : await dataApi.from('tax_declarations').insert(row);
    if (error) throw new Error(error.message || 'Could not save declaration');
  },

  async list(fy = currentFy()): Promise<TaxDeclaration[]> {
    const { data, error } = await dataApi.from('tax_declarations').select('*').eq('fy', fy);
    if (error) throw new Error(error.message || 'Could not load declarations');
    return ((data as unknown[]) || []).map(fromRow);
  },

  async review(id: string, status: 'Approved' | 'Rejected', reviewer: string, notes?: string): Promise<void> {
    const { error } = await dataApi.from('tax_declarations').update({
      status, reviewed_by: reviewer, reviewed_at: new Date().toISOString(), review_notes: notes || null,
    }).eq('id', id);
    if (error) throw new Error(error.message || 'Could not update declaration');
  },

  /** Push approved declarations for this FY into payroll TDS. */
  async primeForPayroll(staff: Staff[], fy = currentFy()): Promise<void> {
    try {
      const all = await this.list(fy);
      const byId = new Map(staff.map(s => [s.id, s]));
      const m = new Map<string, RuntimeTaxProfile>();
      for (const d of all) {
        if (d.status !== 'Approved') continue;
        const s = byId.get(d.staffId);
        const p = profileFromDeclaration(d.regime, d.items);
        const basic = Number(s?.basicSalary ?? 0) * 12;
        const hra = Number(s?.hra ?? 0) * 12;
        m.set(d.staffId, {
          regime: d.regime,
          declaredInvestments: p.declaredInvestments,
          otherDeductions: p.otherDeductions,
          hraExemption: hraExemption(basic, hra, p.rentPaid, p.metroCity),
        });
      }
      setApprovedTaxProfiles(m);
    } catch { /* payroll keeps default new-regime TDS */ }
  },
};

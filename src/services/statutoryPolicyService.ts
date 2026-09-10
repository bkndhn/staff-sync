import { dataApi } from '../lib/dataApi';
import {
  DEFAULT_ORG_STATUTORY_POLICY,
  setRuntimeStatutoryPolicy,
  type OrgStatutoryPolicy,
} from '../utils/statutoryDeductions';
import { DEFAULT_TDS_POLICY, setRuntimeTdsPolicy, type TdsPolicy } from '../utils/statutoryDeductions';
import { DEFAULT_LEAVE_POLICY, setRuntimeLeavePolicy, type OrgLeavePolicy } from '../lib/leavePolicy';

export interface StatutoryPolicyRecord extends OrgStatutoryPolicy {
  id?: string;
  effectiveFrom: string; // yyyy-mm-dd
  tds: TdsPolicy;
  leave: OrgLeavePolicy;
  notes?: string;
}

const cloneLeave = (): OrgLeavePolicy => ({
  ...DEFAULT_LEAVE_POLICY,
  entitlements: { ...DEFAULT_LEAVE_POLICY.entitlements },
  advanceNoticeDays: { ...DEFAULT_LEAVE_POLICY.advanceNoticeDays },
});

export const DEFAULT_STATUTORY_POLICY_RECORD: StatutoryPolicyRecord = {
  ...DEFAULT_ORG_STATUTORY_POLICY,
  effectiveFrom: new Date().toISOString().slice(0, 10),
  tds: { ...DEFAULT_TDS_POLICY },
  leave: cloneLeave(),
};

const merge = (row: any): StatutoryPolicyRecord => ({
  id: row?.id,
  effectiveFrom: row?.effective_from || DEFAULT_STATUTORY_POLICY_RECORD.effectiveFrom,
  notes: row?.notes || undefined,
  pf: { ...DEFAULT_ORG_STATUTORY_POLICY.pf, ...(row?.pf || {}) },
  esi: { ...DEFAULT_ORG_STATUTORY_POLICY.esi, ...(row?.esi || {}) },
  pt: { ...DEFAULT_ORG_STATUTORY_POLICY.pt, ...(row?.pt || {}) },
  lwf: { ...DEFAULT_ORG_STATUTORY_POLICY.lwf, ...(row?.lwf || {}) },
  tds: { ...DEFAULT_TDS_POLICY, ...(row?.tds || {}) },
  leave: {
    ...cloneLeave(),
    ...(row?.leave || {}),
    entitlements: { ...DEFAULT_LEAVE_POLICY.entitlements, ...(row?.leave?.entitlements || {}) },
    advanceNoticeDays: { ...DEFAULT_LEAVE_POLICY.advanceNoticeDays, ...(row?.leave?.advanceNoticeDays || {}) },
  },
});

export const statutoryPolicyService = {
  /** Most recent policy that is already in effect. */
  async load(): Promise<StatutoryPolicyRecord> {
    try {
      const { data } = await dataApi
        .from('statutory_policies')
        .select('id, effective_from, pf, esi, pt, lwf, tds, notes')
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) return merge(data);
    } catch (err) {
      console.warn('statutoryPolicyService.load failed, using defaults', err);
    }
    return { ...DEFAULT_STATUTORY_POLICY_RECORD };
  },

  async save(policy: StatutoryPolicyRecord): Promise<StatutoryPolicyRecord> {
    const payload = {
      effective_from: policy.effectiveFrom,
      pf: policy.pf,
      esi: policy.esi,
      pt: policy.pt,
      lwf: policy.lwf,
      tds: policy.tds,
      notes: policy.notes ?? null,
    };
    if (policy.id) {
      await dataApi.from('statutory_policies').update(payload).eq('id', policy.id);
    } else {
      const { data } = await dataApi.from('statutory_policies').insert(payload).select().single();
      if (data) policy.id = (data as any).id;
    }
    this.prime(policy);
    return policy;
  },

  prime(policy: StatutoryPolicyRecord) {
    setRuntimeStatutoryPolicy({ pf: policy.pf, esi: policy.esi, pt: policy.pt, lwf: policy.lwf });
    setRuntimeTdsPolicy(policy.tds);
  },

  /** Load from the database and push into the shared payroll runtime. */
  async primeFromDb(): Promise<StatutoryPolicyRecord> {
    const policy = await this.load();
    this.prime(policy);
    return policy;
  },
};

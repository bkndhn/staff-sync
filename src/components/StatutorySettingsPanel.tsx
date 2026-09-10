import React, { useEffect, useState } from 'react';
import { Receipt, Loader2, Check, ShieldCheck, Landmark, HeartPulse, Building2, CalendarDays } from 'lucide-react';
import { LEAVE_TYPE_LABELS, type LeaveType } from '../lib/leavePolicy';
import {
  statutoryPolicyService,
  DEFAULT_STATUTORY_POLICY_RECORD,
  type StatutoryPolicyRecord,
} from '../services/statutoryPolicyService';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const Toggle: React.FC<{ on: boolean; onChange: () => void; label: string }> = ({ on, onChange, label }) => (
  <button
    type="button"
    onClick={onChange}
    aria-pressed={on}
    aria-label={label}
    className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-white/20'}`}
  >
    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${on ? 'translate-x-6' : 'translate-x-0'}`} />
  </button>
);

const NumberField: React.FC<{ label: string; value: number; step?: number; onChange: (v: number) => void }> = ({ label, value, step = 1, onChange }) => (
  <label className="flex-1 min-w-[120px]">
    <span className="block text-[11px] text-[var(--text-muted)] mb-1">{label}</span>
    <input
      type="number"
      step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full px-2 py-1.5 rounded-md text-xs bg-[var(--bg-input,transparent)] border border-[var(--glass-border)] text-[var(--text-primary)]"
    />
  </label>
);

const Section: React.FC<{
  title: string;
  desc: string;
  icon: React.ElementType;
  on: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}> = ({ title, desc, icon: Icon, on, onToggle, children }) => (
  <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] space-y-3">
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Icon size={14} className="text-blue-500" /> {title}
        </h3>
        <p className="text-[11px] text-[var(--text-muted)] mt-1">{desc}</p>
      </div>
      <Toggle on={on} onChange={onToggle} label={`Toggle ${title}`} />
    </div>
    {on && children && <div className="flex flex-wrap gap-2">{children}</div>}
  </div>
);

/**
 * Per-client statutory settings — PF, ESI, professional tax, LWF and income
 * tax. Every switch here applies to the next payroll calculation.
 */
export const StatutorySettingsPanel: React.FC = () => {
  const [policy, setPolicy] = useState<StatutoryPolicyRecord>(DEFAULT_STATUTORY_POLICY_RECORD);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    statutoryPolicyService.primeFromDb().then(p => {
      setPolicy(p);
      setLoading(false);
    });
  }, []);

  const patch = (next: Partial<StatutoryPolicyRecord>) => setPolicy(p => ({ ...p, ...next }));

  const save = async () => {
    setSaving(true);
    try {
      const next = await statutoryPolicyService.save({ ...policy });
      setPolicy({ ...next });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Loader2 size={14} className="animate-spin" /> Loading statutory settings…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Section
        title="Provident Fund (PF)"
        desc="Employee share deducted from basic pay. Turn the wage ceiling off to deduct on full basic."
        icon={Landmark}
        on={policy.pf.enabled}
        onToggle={() => patch({ pf: { ...policy.pf, enabled: !policy.pf.enabled } })}
      >
        <NumberField label="Employee %" step={0.25} value={policy.pf.employeePct} onChange={v => patch({ pf: { ...policy.pf, employeePct: v } })} />
        <NumberField label="Wage ceiling (₹)" step={500} value={policy.pf.wageCeiling} onChange={v => patch({ pf: { ...policy.pf, wageCeiling: v } })} />
        <label className="flex items-center gap-2 text-[11px] text-[var(--text-primary)] self-end pb-1">
          <input
            type="checkbox"
            checked={policy.pf.applyCeiling}
            onChange={() => patch({ pf: { ...policy.pf, applyCeiling: !policy.pf.applyCeiling } })}
          />
          Apply ceiling
        </label>
      </Section>

      <Section
        title="ESI"
        desc="Employee State Insurance, deducted only while gross pay stays under the limit."
        icon={HeartPulse}
        on={policy.esi.enabled}
        onToggle={() => patch({ esi: { ...policy.esi, enabled: !policy.esi.enabled } })}
      >
        <NumberField label="Employee %" step={0.05} value={policy.esi.employeePct} onChange={v => patch({ esi: { ...policy.esi, employeePct: v } })} />
        <NumberField label="Gross limit (₹)" step={500} value={policy.esi.grossLimit} onChange={v => patch({ esi: { ...policy.esi, grossLimit: v } })} />
      </Section>

      <Section
        title="Professional Tax"
        desc="Flat state amount deducted every month, unless an employee has their own amount set."
        icon={Building2}
        on={policy.pt.enabled}
        onToggle={() => patch({ pt: { ...policy.pt, enabled: !policy.pt.enabled } })}
      >
        <NumberField label="Monthly amount (₹)" step={10} value={policy.pt.monthlyAmount} onChange={v => patch({ pt: { ...policy.pt, monthlyAmount: v } })} />
      </Section>

      <Section
        title="Labour Welfare Fund (LWF)"
        desc="Small contribution charged only in the months you select."
        icon={ShieldCheck}
        on={policy.lwf.enabled}
        onToggle={() => patch({ lwf: { ...policy.lwf, enabled: !policy.lwf.enabled } })}
      >
        <NumberField label="Employee amount (₹)" step={5} value={policy.lwf.employeeAmount} onChange={v => patch({ lwf: { ...policy.lwf, employeeAmount: v } })} />
        <div className="w-full flex flex-wrap gap-1">
          {MONTHS.map((m, i) => {
            const active = policy.lwf.months.includes(i);
            return (
              <button
                key={m}
                type="button"
                onClick={() =>
                  patch({
                    lwf: {
                      ...policy.lwf,
                      months: active ? policy.lwf.months.filter(x => x !== i) : [...policy.lwf.months, i].sort((a, b) => a - b),
                    },
                  })
                }
                className={`px-2 py-1 rounded-md text-[11px] border ${active ? 'border-emerald-400 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'border-[var(--glass-border)] text-[var(--text-muted)]'}`}
              >
                {m}
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        title="Income tax (TDS)"
        desc="When on, tax is deducted from every payroll run and reported in Form 24Q, the TDS register and Form 16 Part B."
        icon={Receipt}
        on={policy.tds.enabled}
        onToggle={() => patch({ tds: { ...policy.tds, enabled: !policy.tds.enabled } })}
      >
        <div className="w-full space-y-2">
          {([
            { key: 'slab', title: 'Statutory slabs (recommended)', desc: 'Projects annual salary, applies the income-tax slabs, standard deduction, 87A rebate, surcharge and 4% cess, then spreads tax across the remaining months.' },
            { key: 'flat', title: 'Flat percentage', desc: 'Uses the percentage configured on each employee’s TDS line.' },
          ] as const).map(opt => (
            <label
              key={opt.key}
              className={`flex gap-2 p-2 rounded-lg border cursor-pointer ${policy.tds.mode === opt.key ? 'border-emerald-400 bg-emerald-500/10' : 'border-[var(--glass-border)]'}`}
            >
              <input
                type="radio"
                name="tds-mode"
                className="mt-1"
                checked={policy.tds.mode === opt.key}
                onChange={() => patch({ tds: { ...policy.tds, mode: opt.key } })}
              />
              <span>
                <span className="block text-xs font-medium text-[var(--text-primary)]">{opt.title}</span>
                <span className="block text-[11px] text-[var(--text-muted)]">{opt.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <CalendarDays size={14} className="text-blue-500" /> Leave rules
          </h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            Yearly leave days for each type, plus how far ahead staff must apply. Used on the staff portal and in approvals.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(LEAVE_TYPE_LABELS) as LeaveType[]).map(type => (
            <NumberField
              key={type}
              label={`${LEAVE_TYPE_LABELS[type]} (days/yr)`}
              value={policy.leave.entitlements[type] ?? 0}
              onChange={v =>
                patch({ leave: { ...policy.leave, entitlements: { ...policy.leave.entitlements, [type]: v } } })
              }
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <NumberField
            label="Max days in one request"
            value={policy.leave.maxConsecutiveDays}
            onChange={v => patch({ leave: { ...policy.leave, maxConsecutiveDays: v } })}
          />
          <NumberField
            label="Casual leave notice (days)"
            value={policy.leave.advanceNoticeDays.casual ?? 0}
            onChange={v =>
              patch({ leave: { ...policy.leave, advanceNoticeDays: { ...policy.leave.advanceNoticeDays, casual: v } } })
            }
          />
          <NumberField
            label="Personal leave notice (days)"
            value={policy.leave.advanceNoticeDays.personal ?? 0}
            onChange={v =>
              patch({ leave: { ...policy.leave, advanceNoticeDays: { ...policy.leave.advanceNoticeDays, personal: v } } })
            }
          />
          <label className="flex items-center gap-2 text-[11px] text-[var(--text-primary)] self-end pb-1">
            <input
              type="checkbox"
              checked={policy.leave.allowBackdatedSickEmergency}
              onChange={() =>
                patch({ leave: { ...policy.leave, allowBackdatedSickEmergency: !policy.leave.allowBackdatedSickEmergency } })
              }
            />
            Allow past-dated sick / emergency leave
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[11px] text-[var(--text-muted)]">
          Effective from
          <input
            type="date"
            value={policy.effectiveFrom}
            onChange={e => patch({ effectiveFrom: e.target.value })}
            className="ml-2 px-2 py-1 rounded-md text-xs bg-transparent border border-[var(--glass-border)] text-[var(--text-primary)]"
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save statutory settings
        </button>
        {saved && <span className="text-xs text-emerald-500 flex items-center gap-1"><Check size={14} /> Saved — applies to the next payroll calculation.</span>}
      </div>
    </div>
  );
};

export default StatutorySettingsPanel;

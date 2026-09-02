import React, { useEffect, useState } from 'react';
import { Receipt, Loader2, Check } from 'lucide-react';
import { settingsService } from '../services/settingsService';
import type { TdsPolicy } from '../utils/statutoryDeductions';

/**
 * Per-client income-tax switch. When TDS is off, no tax line is deducted in
 * payroll and Form 24Q / Form 16 exports come out empty for the period.
 */
export const TdsSettingsPanel: React.FC = () => {
  const [policy, setPolicy] = useState<TdsPolicy>({ enabled: false, mode: 'slab' });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    settingsService.primeTdsPolicy().then(p => {
      setPolicy(p);
      setLoading(false);
    });
  }, []);

  const save = async (next: TdsPolicy) => {
    setPolicy(next);
    await settingsService.setTdsPolicy(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Loader2 size={14} className="animate-spin" /> Loading tax settings…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)]">
        <div className="flex-1 pr-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
            <Receipt size={14} className="text-emerald-500" /> Deduct income tax (TDS)
          </h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            When on, tax is deducted from every payroll run and reported in Form 24Q, the TDS register and Form 16 Part B.
          </p>
        </div>
        <button
          type="button"
          onClick={() => save({ ...policy, enabled: !policy.enabled })}
          className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${policy.enabled ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-white/20'}`}
          aria-pressed={policy.enabled}
          aria-label="Toggle TDS deduction"
        >
          <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${policy.enabled ? 'translate-x-6' : 'translate-x-0'}`} />
        </button>
      </div>

      {policy.enabled && (
        <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] space-y-2">
          <h4 className="text-xs font-semibold text-[var(--text-primary)]">Computation method</h4>
          {([
            { key: 'slab', title: 'Statutory slabs (recommended)', desc: 'Projects annual salary, applies the income-tax slabs, standard deduction, 87A rebate, surcharge and 4% cess, then spreads the tax over the remaining months of the financial year.' },
            { key: 'flat', title: 'Flat percentage', desc: 'Uses the percentage configured on each employee’s TDS deduction line.' },
          ] as const).map(opt => (
            <label
              key={opt.key}
              className={`flex gap-2 p-2 rounded-lg border cursor-pointer ${policy.mode === opt.key ? 'border-emerald-400 bg-emerald-500/10' : 'border-[var(--glass-border)]'}`}
            >
              <input
                type="radio"
                name="tds-mode"
                className="mt-1"
                checked={policy.mode === opt.key}
                onChange={() => save({ ...policy, mode: opt.key })}
              />
              <span>
                <span className="block text-xs font-medium text-[var(--text-primary)]">{opt.title}</span>
                <span className="block text-[11px] text-[var(--text-muted)]">{opt.desc}</span>
              </span>
            </label>
          ))}
          <p className="text-[11px] text-[var(--text-muted)]">
            Tax is only deducted for employees who have the TDS line enabled in their statutory settings.
          </p>
        </div>
      )}

      {saved && (
        <div className="flex items-center gap-2 text-xs text-emerald-500">
          <Check size={14} /> Saved — applies to the next payroll calculation.
        </div>
      )}
    </div>
  );
};

export default TdsSettingsPanel;

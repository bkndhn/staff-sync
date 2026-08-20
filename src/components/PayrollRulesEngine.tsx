import React, { useState, useEffect } from 'react';
import { Save, Calculator, AlertCircle, Plus, Trash2 } from 'lucide-react';
import { payrollRulesService } from '../services/payrollRulesService';
import { customAlert } from './CustomDialog';

const AVAILABLE_VARIABLES = [
  '{BASIC}', '{HRA}', '{INCENTIVE}', 
  '{CALC_DAYS}', '{PRESENT_DAYS}', '{ABSENT_DAYS}', 
  '{LATE_DAYS}', '{EARLY_LEAVES}', '{SUNDAY_ABSENTS}'
];

const DEFAULT_RULES = [
  { key: 'BASIC_EARNED', label: 'Basic Salary Earned', placeholder: '{BASIC} / {CALC_DAYS} * {PRESENT_DAYS}' },
  { key: 'HRA_EARNED', label: 'HRA Earned', placeholder: '({PRESENT_DAYS} >= 25) ? {HRA} : 0  (Note: logic evaluation handles standard math, not conditionals yet. Example: {HRA})' },
  { key: 'INCENTIVE_EARNED', label: 'Incentive Earned', placeholder: '{INCENTIVE} / {CALC_DAYS} * {PRESENT_DAYS}' },
  { key: 'LATE_DEDUCTION', label: 'Late Deduction (Total)', placeholder: '({BASIC} / {CALC_DAYS}) * 0.5 * {LATE_DAYS}' },
  { key: 'EARLY_DEDUCTION', label: 'Early Leave Deduction (Total)', placeholder: '({BASIC} / {CALC_DAYS}) * 0.5 * {EARLY_LEAVES}' },
  { key: 'SUNDAY_PENALTY', label: 'Sunday Penalty', placeholder: '{SUNDAY_ABSENTS} * 500' }
];

export const PayrollRulesEngine: React.FC = () => {
  const [rules, setRules] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      const fetched = await payrollRulesService.getPayrollRules();
      setRules(fetched);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (key: string, expression: string) => {
    setSaving(true);
    try {
      await payrollRulesService.savePayrollRule(key, expression);
      const updated = { ...rules };
      if (!expression) delete updated[key];
      else updated[key] = expression;
      setRules(updated);
      await customAlert(`Rule for ${key} saved successfully!`);
    } catch (err: any) {
      await customAlert(`Failed to save rule: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4 text-[var(--text-secondary)]">Loading rule engine...</div>;

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
        <h3 className="text-lg font-medium text-[var(--text-primary)] mb-2 flex items-center gap-2">
          <Calculator className="text-blue-400" size={20} />
          Custom Payroll Formulas
        </h3>
        <p className="text-sm text-[var(--text-secondary)] mb-4">
          Override the default salary calculation logic by defining custom mathematical formulas. If a field is left empty, the system will use the default calculation.
        </p>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_VARIABLES.map(v => (
            <span key={v} className="px-2 py-1 text-xs font-mono bg-[var(--bg-tertiary)] border border-white/10 rounded-md text-[var(--text-primary)]">
              {v}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {DEFAULT_RULES.map(def => {
          const val = rules[def.key] || '';
          return (
            <div key={def.key} className="p-4 rounded-xl glass-card-static border border-white/10 flex flex-col md:flex-row md:items-center gap-4">
              <div className="md:w-1/3">
                <label className="block text-sm font-medium text-[var(--text-primary)]">{def.label}</label>
                <span className="text-xs text-[var(--text-muted)] font-mono">{def.key}</span>
              </div>
              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  value={rules[def.key] ?? ''}
                  onChange={e => setRules(prev => ({ ...prev, [def.key]: e.target.value }))}
                  placeholder={def.placeholder}
                  className="input-premium font-mono text-sm w-full"
                />
                <button
                  onClick={() => handleSave(def.key, rules[def.key] || '')}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Save size={16} /> Save
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PayrollRulesEngine;

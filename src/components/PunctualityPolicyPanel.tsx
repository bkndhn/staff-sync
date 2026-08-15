import { useEffect, useState } from 'react';
import { Clock, LogOut, Loader2 } from 'lucide-react';
import { settingsService, DEFAULT_PUNCTUALITY_POLICY, PunctualityPolicySetting } from '../services/settingsService';
import { setPunctualityPolicy } from '../utils/salaryCalculations';

/**
 * Org-wide kill switches for punctuality deductions.
 * Individual staff exemptions still apply on top of these.
 */
export default function PunctualityPolicyPanel() {
  const [policy, setPolicy] = useState<PunctualityPolicySetting>(DEFAULT_PUNCTUALITY_POLICY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await settingsService.getPunctualityPolicy();
        setPolicy(stored);
        setPunctualityPolicy(stored);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const toggle = async (key: keyof PunctualityPolicySetting) => {
    const next = { ...policy, [key]: !policy[key] };
    setPolicy(next);
    setPunctualityPolicy(next);
    setSaving(true);
    try {
      await settingsService.setPunctualityPolicySetting(next);
    } catch {
      setPolicy(policy);
      setPunctualityPolicy(policy);
    } finally {
      setSaving(false);
    }
  };

  const rows: { key: keyof PunctualityPolicySetting; label: string; hint: string; icon: typeof Clock }[] = [
    {
      key: 'disableLateDeductionForAll',
      label: 'Disable late-coming deductions for all staff',
      hint: 'No late deduction is applied to anyone during salary calculation.',
      icon: Clock,
    },
    {
      key: 'disableEarlyDeductionForAll',
      label: 'Disable early-leaving deductions for all staff',
      hint: 'No early-exit deduction is applied to anyone during salary calculation.',
      icon: LogOut,
    },
  ];

  if (loading) {
    return <div className="text-xs text-[var(--text-muted)] py-3">Loading punctuality policy…</div>;
  }

  return (
    <div className="space-y-2">
      {rows.map(({ key, label, hint, icon: Icon }) => (
        <label
          key={key}
          className="flex items-start gap-3 p-3 rounded-lg border border-[var(--border-color)] cursor-pointer hover:bg-[var(--surface-hover)]"
        >
          <input
            type="checkbox"
            checked={policy[key]}
            onChange={() => toggle(key)}
            className="mt-1 w-4 h-4 accent-blue-600"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
              <Icon size={14} className="text-blue-500 shrink-0" />
              <span>{label}</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{hint}</p>
          </div>
        </label>
      ))}
      <p className="text-xs text-[var(--text-muted)] flex items-center gap-2">
        {saving && <Loader2 size={12} className="animate-spin" />}
        Per-staff exemptions in the Staff form continue to apply even when these switches are off.
      </p>
    </div>
  );
}

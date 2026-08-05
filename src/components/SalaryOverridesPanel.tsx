import React, { useState, useEffect } from 'react';
import { Save, FileEdit } from 'lucide-react';
import { appSettingsService } from '../services/appSettingsService';
import { customAlert } from './CustomDialog';

export interface PayrollOverrideConfig {
  oldAdvance: boolean;
  currentAdvance: boolean;
  deduction: boolean;
  basic: boolean;
  incentive: boolean;
  hra: boolean;
  mealAllowance: boolean;
  sundayPenalty: boolean;
}

const DEFAULT_CONFIG: PayrollOverrideConfig = {
  oldAdvance: true,
  currentAdvance: true,
  deduction: true,
  basic: false,
  incentive: false,
  hra: false,
  mealAllowance: false,
  sundayPenalty: false
};

const PayrollOverridesPanel: React.FC = () => {
  const [config, setConfig] = useState<SalaryOverrideConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const saved = await appSettingsService.getSetting('salary_override_config');
      if (saved) {
        setConfig(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Error loading salary override config:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (key: keyof PayrollOverrideConfig) => {
    setConfig(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await appSettingsService.setSetting('salary_override_config', JSON.stringify(config));
      await customAlert('Payroll override configuration saved successfully!');
    } catch (error) {
      console.error('Error saving salary override config:', error);
      await customAlert('Failed to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-[var(--text-muted)] p-4">Loading...</div>;

  return (
    <div className="space-y-4 p-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Object.entries(config).map(([key, value]) => {
          // Format key to readable label (e.g. currentAdvance -> Current Advance)
          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          return (
            <label key={key} className="flex items-center gap-3 p-3 bg-white/5 border border-[var(--border-color)] rounded-xl cursor-pointer hover:bg-white/10 transition-colors">
              <input type="checkbox" className="sr-only" checked={value} onChange={() => handleToggle(key as keyof PayrollOverrideConfig)} />
              <div className={`w-10 h-6 rounded-full p-1 transition-colors ${value ? 'bg-indigo-500' : 'bg-gray-700'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${value ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
              <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
            </label>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-premium btn-primary gap-2"
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
    </div>
  );
};

export default PayrollOverridesPanel;

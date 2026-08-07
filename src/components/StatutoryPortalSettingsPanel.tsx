import React, { useEffect, useState } from 'react';
import { ShieldCheck, Save } from 'lucide-react';
import {
  statutoryPortalService,
  StatutoryPortalConfig,
  DEFAULT_STATUTORY_CONFIG,
} from '../services/statutoryPortalService';

const PAGE_LABELS: Record<keyof StatutoryPortalConfig['visiblePages'], string> = {
  dashboard: 'Dashboard',
  staff: 'Staff',
  attendance: 'Attendance',
  salary: 'Payroll',
  reports: 'Reports',
  leave: 'Leave',
  profile: 'Profile',
  settings: 'Settings',
  action_center: 'Action Center',
};
const WIDGET_LABELS: Record<keyof StatutoryPortalConfig['dashboardWidgets'], string> = {
  staffCount: 'Staff Count',
  attendance: 'Attendance Summary',
  salary: 'Payroll Summary',
  breaks: 'Breaks',
  charts: 'Charts',
  recentActivity: 'Recent Activity',
  quickActions: 'Quick Actions',
};
const DATA_LABELS: Record<keyof StatutoryPortalConfig['dataVisibility'], string> = {
  salary: 'Payroll',
  attendance: 'Attendance',
  contact: 'Contact Details',
  employeeId: 'Employee IDs',
  department: 'Department',
  designation: 'Designation',
  documents: 'Documents',
  leave: 'Leave',
};

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({
  checked, onChange, label,
}) => (
  <label className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 border border-white/10 cursor-pointer">
    <span className="text-sm text-[var(--text-primary)]">{label}</span>
    <span className="relative inline-flex items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="sr-only peer"
      />
      <span className="w-10 h-5 bg-white/10 rounded-full peer-checked:bg-emerald-500 transition-colors" />
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </span>
  </label>
);

const StatutoryPortalSettingsPanel: React.FC = () => {
  const [cfg, setCfg] = useState<StatutoryPortalConfig>(DEFAULT_STATUTORY_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>('');

  useEffect(() => {
    statutoryPortalService.load().then(c => { setCfg(c); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  const update = <K extends keyof StatutoryPortalConfig, F extends keyof StatutoryPortalConfig[K]>(
    section: K, field: F, value: boolean
  ) => {
    setCfg(prev => ({ ...prev, [section]: { ...(prev[section] as any), [field]: value } }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved = await statutoryPortalService.save(cfg);
      setCfg(saved);
      setMsg('Saved');
      setTimeout(() => setMsg(''), 2500);
    } catch (e: any) {
      setMsg(`Error: ${e?.message || 'failed to save'}`);
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="glass-card-static p-5 rounded-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <ShieldCheck size={20} className="text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--text-primary)] text-sm">Statutory Portal Configuration</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Controls what the statutory login can see.
            </p>
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="btn-premium px-3 py-1.5 text-xs flex items-center gap-1.5"
        >
          <Save size={14} /> {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {msg && <div className="mb-3 text-xs text-emerald-400">{msg}</div>}

      <div className="grid md:grid-cols-3 gap-4">
        <section>
          <h4 className="text-xs uppercase tracking-wider text-white/50 mb-2">Visible Pages</h4>
          <div className="space-y-2">
            {(Object.keys(PAGE_LABELS) as Array<keyof typeof PAGE_LABELS>).map(k => (
              <Toggle key={k} label={PAGE_LABELS[k]} checked={cfg.visiblePages[k]}
                onChange={v => update('visiblePages', k, v)} />
            ))}
          </div>
        </section>

        <section>
          <h4 className="text-xs uppercase tracking-wider text-white/50 mb-2">Dashboard Widgets</h4>
          <div className="space-y-2">
            {(Object.keys(WIDGET_LABELS) as Array<keyof typeof WIDGET_LABELS>).map(k => (
              <Toggle key={k} label={WIDGET_LABELS[k]} checked={cfg.dashboardWidgets[k]}
                onChange={v => update('dashboardWidgets', k, v)} />
            ))}
          </div>
        </section>

        <section>
          <h4 className="text-xs uppercase tracking-wider text-white/50 mb-2">Data Visibility</h4>
          <div className="space-y-2">
            {(Object.keys(DATA_LABELS) as Array<keyof typeof DATA_LABELS>).map(k => (
              <Toggle key={k} label={DATA_LABELS[k]} checked={cfg.dataVisibility[k]}
                onChange={v => update('dataVisibility', k, v)} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default StatutoryPortalSettingsPanel;

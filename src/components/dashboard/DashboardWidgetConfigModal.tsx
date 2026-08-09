import React from 'react';
import { X, Sliders, Eye, EyeOff } from 'lucide-react';

export interface DashboardWidgetConfig {
  showTrendChart: boolean;
  showDonutChart: boolean;
  showBranchBarChart: boolean;
  showPunchStream: boolean;
  showPunctuality: boolean;
  showDailyPayroll: boolean;
  showAIInsights: boolean;
  showBreaksWidget: boolean;
  showBranchCards: boolean;
}

export const DEFAULT_WIDGET_CONFIG: DashboardWidgetConfig = {
  showTrendChart: true,
  showDonutChart: true,
  showBranchBarChart: true,
  showPunchStream: true,
  showPunctuality: true,
  showDailyPayroll: true,
  showAIInsights: true,
  showBreaksWidget: true,
  showBranchCards: true,
};

interface DashboardWidgetConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: DashboardWidgetConfig;
  onChange: (config: DashboardWidgetConfig) => void;
}

export const DashboardWidgetConfigModal: React.FC<DashboardWidgetConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onChange,
}) => {
  if (!isOpen) return null;

  const widgets: { key: keyof DashboardWidgetConfig; label: string; desc: string }[] = [
    { key: 'showAIInsights', label: 'AI Workforce Insights', desc: 'Automated anomaly and turnout highlights' },
    { key: 'showTrendChart', label: 'Attendance Trend Line Chart', desc: 'Historical turnout trend over 7, 14, or 30 days' },
    { key: 'showDonutChart', label: 'Attendance Breakdown Donut', desc: 'Visual distribution of Present, Half-Day, and Absent staff' },
    { key: 'showBranchBarChart', label: 'Branch Comparison Bar Chart', desc: 'Side-by-side branch attendance percentage comparison' },
    { key: 'showPunchStream', label: 'Real-Time Punch Stream', desc: 'Live ticker of check-in events as they occur' },
    { key: 'showPunctuality', label: 'Punctuality Intelligence', desc: 'On-Time arrival rates and late staff ping list' },
    { key: 'showDailyPayroll', label: 'Daily Wage Bill Overview', desc: 'Estimated daily wage cost for present staff' },
    { key: 'showBreaksWidget', label: 'Breaks & Shift Tracker', desc: 'Active break durations and 7-day break minutes' },
    { key: 'showBranchCards', label: 'Branch Attendance Detail Cards', desc: 'Full lists of present, absent, guest, and flex staff per branch' },
  ];

  const toggle = (key: keyof DashboardWidgetConfig) => {
    onChange({ ...config, [key]: !config[key] });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content !max-w-lg w-full max-h-[85vh] flex flex-col p-0 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--glass-border)] flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center border border-purple-500/30">
              <Sliders size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)]">Customize Dashboard Layout</h2>
              <p className="text-xs text-[var(--text-muted)]">Toggle widgets to personalize your view</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-[var(--text-primary)] flex items-center justify-center transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* List of Widgets */}
        <div className="p-4 sm:p-6 space-y-2.5 overflow-y-auto flex-1">
          {widgets.map(w => {
            const active = config[w.key];
            return (
              <div
                key={w.key}
                onClick={() => toggle(w.key)}
                className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                  active
                    ? 'bg-purple-500/10 border-purple-500/40 text-[var(--text-primary)]'
                    : 'bg-white/5 border-[var(--glass-border)] opacity-60 hover:opacity-80'
                }`}
              >
                <div>
                  <h4 className="text-sm font-semibold">{w.label}</h4>
                  <p className="text-xs text-[var(--text-muted)]">{w.desc}</p>
                </div>
                <div className={`p-2 rounded-lg ${active ? 'bg-purple-500/20 text-purple-300' : 'bg-white/5 text-[var(--text-muted)]'}`}>
                  {active ? <Eye size={16} /> : <EyeOff size={16} />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--glass-border)] bg-white/5 flex justify-between items-center">
          <button
            onClick={() => onChange(DEFAULT_WIDGET_CONFIG)}
            className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors underline"
          >
            Reset Defaults
          </button>
          <button onClick={onClose} className="px-5 py-2 btn-premium text-xs font-semibold rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-md">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardWidgetConfigModal;

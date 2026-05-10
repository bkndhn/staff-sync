import React, { useEffect, useState } from 'react';
import { Clock, Save, RotateCcw, Check } from 'lucide-react';
import { shiftService, ShiftWindows, ShiftKey, DEFAULT_SHIFT_WINDOWS } from '../services/shiftService';

const SHIFTS: ShiftKey[] = ['Morning', 'Evening', 'Both'];

const ShiftWindowsPanel: React.FC = () => {
  const [windows, setWindows] = useState<ShiftWindows>(DEFAULT_SHIFT_WINDOWS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const w = await shiftService.loadGlobal(true);
        if (!cancelled) setWindows(w);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const update = (shift: ShiftKey, field: keyof ShiftWindows[ShiftKey], value: string) => {
    setWindows(prev => ({
      ...prev,
      [shift]: {
        ...prev[shift],
        [field]: field === 'start' || field === 'end' ? value : Number(value),
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await shiftService.saveGlobal(windows);
    setSaving(false);
    if (ok) setSavedAt(Date.now());
    setTimeout(() => setSavedAt(null), 2500);
  };

  const handleReset = () => setWindows(DEFAULT_SHIFT_WINDOWS);

  return (
    <div className="glass-card-static p-4 rounded-xl space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center">
            <Clock size={20} className="text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--text-primary)] text-sm">Shift Windows & Auto Half-Day Rules</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Defines when staff should arrive/leave per shift. Late arrival or early leave beyond the grace marks Half Day.
              Worked hours below the threshold also marks Half Day or Absent (whichever is stricter).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-xs rounded-lg bg-white/5 hover:bg-white/10 text-white/70 border border-white/10 flex items-center gap-1.5"
            disabled={saving || loading}
          >
            <RotateCcw size={12} /> Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="btn-premium px-3 py-1.5 text-xs flex items-center gap-1.5"
          >
            {savedAt ? <><Check size={12} /> Saved</> : <><Save size={12} /> {saving ? 'Saving…' : 'Save'}</>}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-xs text-white/50 py-4">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-white/50 border-b border-white/10">
                <th className="py-2 pr-2 font-medium">Shift</th>
                <th className="py-2 px-2 font-medium">Start</th>
                <th className="py-2 px-2 font-medium">End</th>
                <th className="py-2 px-2 font-medium">Late grace (min)</th>
                <th className="py-2 px-2 font-medium">Early-leave grace (min)</th>
                <th className="py-2 px-2 font-medium">Min hrs full</th>
                <th className="py-2 px-2 font-medium">Min hrs half</th>
              </tr>
            </thead>
            <tbody>
              {SHIFTS.map(shift => {
                const w = windows[shift];
                return (
                  <tr key={shift} className="border-b border-white/5">
                    <td className="py-2 pr-2 font-semibold text-white/80">{shift}</td>
                    <td className="py-1 px-2"><input type="time" value={w.start} onChange={e => update(shift, 'start', e.target.value)} className="input-premium px-2 py-1 text-xs w-full min-w-[110px]" /></td>
                    <td className="py-1 px-2"><input type="time" value={w.end} onChange={e => update(shift, 'end', e.target.value)} className="input-premium px-2 py-1 text-xs w-full min-w-[110px]" /></td>
                    <td className="py-1 px-2"><input type="number" min="0" max="120" value={w.graceLateMin} onChange={e => update(shift, 'graceLateMin', e.target.value)} className="input-premium px-2 py-1 text-xs w-20 text-center" /></td>
                    <td className="py-1 px-2"><input type="number" min="0" max="120" value={w.graceEarlyMin} onChange={e => update(shift, 'graceEarlyMin', e.target.value)} className="input-premium px-2 py-1 text-xs w-20 text-center" /></td>
                    <td className="py-1 px-2"><input type="number" min="0" max="24" step="0.5" value={w.minHoursFull} onChange={e => update(shift, 'minHoursFull', e.target.value)} className="input-premium px-2 py-1 text-xs w-20 text-center" /></td>
                    <td className="py-1 px-2"><input type="number" min="0" max="24" step="0.5" value={w.minHoursHalf} onChange={e => update(shift, 'minHoursHalf', e.target.value)} className="input-premium px-2 py-1 text-xs w-20 text-center" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[10px] text-white/40 mt-2">
            Per-staff overrides can be set on each staff record (Phase 3 will add the UI). Until then, edit the JSON in
            the staff's <code>shift_window</code> column to override these defaults.
          </p>
        </div>
      )}
    </div>
  );
};

export default ShiftWindowsPanel;
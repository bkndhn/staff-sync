import { useEffect, useState } from 'react';
import { appSettingsService } from '../services/appSettingsService';

export default function HoursRuleSettings() {
  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState(8);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    appSettingsService.getSetting('hours_based_attendance').then((raw) => {
      if (!raw) return;
      try { const v = JSON.parse(raw); setEnabled(!!v.enabled); setHours(Number(v.fullDayHours) || 8); } catch { /* ignore */ }
    });
  }, []);

  const save = async () => {
    setSaving(true);
    const ok = await appSettingsService.setSetting('hours_based_attendance', JSON.stringify({ enabled, fullDayHours: hours, autoOut: true }));
    setSaving(false);
    setMsg(ok ? 'Saved' : 'Could not save');
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">Hours-based attendance</h3>
          <p className="text-xs text-muted-foreground">Ignore late in / early out. Count worked hours only. No overtime.</p>
        </div>
        <input type="checkbox" className="h-5 w-5 shrink-0" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-foreground shrink-0">Full day at</label>
        <input type="number" min={1} max={16} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-foreground" />
        <span className="text-sm text-muted-foreground">hours</span>
      </div>
      <p className="text-xs text-muted-foreground">
        ≥{hours}h = Full · ≥{(hours * 0.75).toFixed(1)}h = 3/4 · ≥{(hours / 2).toFixed(1)}h = Half · less = Absent
      </p>
      <div className="flex items-center gap-3"><button onClick={save} disabled={saving} className="rounded-lg bg-primary px-4 py-1.5 text-sm text-primary-foreground">{saving ? 'Saving…' : 'Save'}</button><span className="text-xs text-muted-foreground">{msg}</span></div>
    </div>
  );
}

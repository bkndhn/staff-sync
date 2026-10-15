import { useEffect, useState } from 'react';
import { appSettingsService } from '../services/appSettingsService';
import { dataApi } from '../lib/dataApi';
import { parseHoursRule, invalidateHoursRule, type StaffHoursOverride } from '../utils/hoursAttendance';

export default function HoursRuleSettings() {
  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState(8);
  const [overrides, setOverrides] = useState<Record<string, StaffHoursOverride>>({});
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    appSettingsService.getSetting('hours_based_attendance').then((raw) => {
      const v = parseHoursRule(raw);
      setEnabled(!!v.enabled); setHours(Number(v.fullDayHours) || 8); setOverrides(v.overrides || {});
    });
    dataApi.from('staff').select('id, name').eq('is_active', true).order('name').then(({ data }: any) => setStaff(data || []));
  }, []);

  const setMode = (id: string, mode: string) => {
    setOverrides((o) => {
      const n = { ...o };
      if (mode === 'default') delete n[id];
      else n[id] = { mode: mode as 'hours' | 'standard', fullDayHours: o[id]?.fullDayHours ?? hours };
      return n;
    });
  };

  const save = async () => {
    setSaving(true);
    const ok = await appSettingsService.setSetting('hours_based_attendance', JSON.stringify({ enabled, fullDayHours: hours, autoOut: true, overrides }));
    invalidateHoursRule();
    setSaving(false);
    setMsg(ok ? 'Saved' : 'Could not save');
  };

  const list = staff.filter((s) => s.name?.toLowerCase().includes(search.toLowerCase()));
  const count = Object.keys(overrides).length;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground">Hours-based attendance</h3>
          <p className="text-xs text-muted-foreground">Ignore late in / early out. Count worked hours only. No overtime.</p>
        </div>
        <input type="checkbox" aria-label="Enable hours-based attendance" className="h-5 w-5 shrink-0" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-sm text-foreground shrink-0">Full day at</label>
        <input type="number" min={1} max={16} step={0.5} value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-24 rounded-lg border border-border bg-background px-2 py-1 text-foreground" />
        <span className="text-sm text-muted-foreground">hours</span>
      </div>
      <p className="text-xs text-muted-foreground">
        ≥{hours}h = Full · ≥{(hours * 0.75).toFixed(1)}h = 3/4 · ≥{(hours / 2).toFixed(1)}h = Half · less = Absent
      </p>

      <details className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground">Per-staff overrides {count > 0 && <span className="text-muted-foreground">({count})</span>}</summary>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff" className="mt-3 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground" />
        <div className="mt-2 max-h-72 overflow-y-auto divide-y divide-border">
          {list.map((s) => {
            const o = overrides[s.id];
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="flex-1 min-w-[8rem] truncate text-sm text-foreground">{s.name}</span>
                <select value={o?.mode || 'default'} onChange={(e) => setMode(s.id, e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground">
                  <option value="default">Use default</option>
                  <option value="hours">Hours-based</option>
                  <option value="standard">Shift times</option>
                </select>
                {o?.mode === 'hours' && (
                  <input type="number" min={1} max={16} step={0.5} value={o.fullDayHours ?? hours} aria-label={`Full day hours for ${s.name}`}
                    onChange={(e) => setOverrides((p) => ({ ...p, [s.id]: { mode: 'hours', fullDayHours: Number(e.target.value) } }))}
                    className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground" />
                )}
              </div>
            );
          })}
        </div>
      </details>

      <div className="flex items-center gap-3"><button onClick={save} disabled={saving} className="rounded-lg bg-primary px-4 py-1.5 text-sm text-primary-foreground">{saving ? 'Saving…' : 'Save'}</button><span className="text-xs text-muted-foreground">{msg}</span></div>
    </div>
  );
}

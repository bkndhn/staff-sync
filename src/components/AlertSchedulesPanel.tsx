import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Clock, Sparkles, X } from 'lucide-react';
import {
  alertScheduleService,
  ALERT_KIND_INFO,
  RECOMMENDED,
  ROLE_OPTIONS,
  type AlertKind,
  type AlertSchedule,
} from '../services/alertScheduleService';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const to12h = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

const chip = (on: boolean) =>
  `px-2 py-1 rounded-md text-[11px] font-medium border transition-colors ${
    on
      ? 'bg-blue-500/15 text-blue-500 border-blue-500/40'
      : 'bg-transparent text-[var(--text-muted)] border-[var(--glass-border)]'
  }`;

const ScheduleCard: React.FC<{
  value: AlertSchedule;
  onSave: (s: AlertSchedule) => Promise<void>;
  onDelete: () => void;
}> = ({ value, onSave, onDelete }) => {
  const [s, setS] = useState(value);
  const [newTime, setNewTime] = useState('09:00');
  const info = ALERT_KIND_INFO[s.kind];
  const dirty = JSON.stringify(s) !== JSON.stringify(value);
  const canBeforeShift = s.kind === 'punch_in_reminder' || s.kind === 'punch_out_reminder';
  const set = (patch: Partial<AlertSchedule>) => setS((p) => ({ ...p, ...patch }));
  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  useEffect(() => setS(value), [value]);

  return (
    <div className="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)]">{info.title}</p>
          <p className="text-xs text-[var(--text-muted)]">{info.hint}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={s.enabled}
            aria-label={`${info.title} on or off`}
            onClick={() => onSave({ ...s, enabled: !s.enabled })}
            className={`relative w-11 h-6 rounded-full transition-colors ${s.enabled ? 'bg-blue-500' : 'bg-gray-400/40'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${s.enabled ? 'translate-x-5' : ''}`} />
          </button>
          <button type="button" aria-label="Delete alert" onClick={onDelete} className="p-1.5 rounded-md text-red-500 hover:bg-red-500/10">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {canBeforeShift && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={chip(s.timing === 'before_shift')} onClick={() => set({ timing: 'before_shift' })}>
            Before each shift
          </button>
          <button type="button" className={chip(s.timing === 'fixed')} onClick={() => set({ timing: 'fixed' })}>
            At set times
          </button>
        </div>
      )}

      {s.timing === 'before_shift' ? (
        <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          Send
          <input
            type="number"
            min={0}
            max={240}
            step={5}
            value={s.offsetMinutes}
            onChange={(e) => set({ offsetMinutes: Math.max(0, Math.min(240, Number(e.target.value) || 0)) })}
            className="input-premium w-20"
          />
          min before shift {s.kind === 'punch_in_reminder' ? 'start' : 'end'} (uses each branch's shift times)
        </label>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {s.times.length === 0 && <span className="text-xs text-[var(--text-muted)]">No times yet — add one.</span>}
            {[...s.times].sort().map((t) => (
              <span key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-blue-500/10 text-blue-500">
                <Clock size={11} /> {to12h(t)}
                <button type="button" aria-label={`Remove ${to12h(t)}`} onClick={() => set({ times: s.times.filter((x) => x !== t) })}>
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input type="time" step={900} value={newTime} onChange={(e) => setNewTime(e.target.value)} className="input-premium w-32" />
            <button
              type="button"
              disabled={!newTime || s.times.includes(newTime) || s.times.length >= 12}
              onClick={() => set({ times: [...s.times, newTime.slice(0, 5)] })}
              className="btn-ghost text-xs flex items-center gap-1 disabled:opacity-50"
            >
              <Plus size={12} /> Add time
            </button>
          </div>
        </div>
      )}

      {s.kind === 'salary_prep' ? (
        <label className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          Day of month
          <input
            type="number"
            min={1}
            max={31}
            value={s.dayOfMonth ?? 28}
            onChange={(e) => set({ dayOfMonth: Math.max(1, Math.min(31, Number(e.target.value) || 28)) })}
            className="input-premium w-20"
          />
          <span>(31 = last day)</span>
        </label>
      ) : (
        <div className="flex flex-wrap gap-1">
          {DAYS.map((d, i) => (
            <button key={d} type="button" className={chip(s.days.includes(i))} onClick={() => set({ days: toggleIn(s.days, i).sort() })}>
              {d}
            </button>
          ))}
        </div>
      )}

      {!info.toStaff && (
        <div className="space-y-1">
          <p className="text-[11px] text-[var(--text-muted)]">Send to</p>
          <div className="flex flex-wrap gap-1">
            {ROLE_OPTIONS.map((r) => (
              <button key={r.id} type="button" className={chip(s.audienceRoles.includes(r.id))} onClick={() => set({ audienceRoles: toggleIn(s.audienceRoles, r.id) })}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {dirty && (
        <div className="flex gap-2">
          <button type="button" onClick={() => onSave(s)} className="btn-premium text-xs px-3 py-1.5">Save</button>
          <button type="button" onClick={() => setS(value)} className="btn-ghost text-xs">Cancel</button>
        </div>
      )}
    </div>
  );
};

export const AlertSchedulesPanel: React.FC = () => {
  const [items, setItems] = useState<AlertSchedule[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addKind, setAddKind] = useState<AlertKind>('attendance_summary');

  const load = async () => setItems(await alertScheduleService.list());
  useEffect(() => { load(); }, []);

  const save = async (s: AlertSchedule) => {
    setError(null);
    if (s.timing === 'fixed' && s.times.length === 0) { setError('Add at least one time.'); return; }
    if (!ALERT_KIND_INFO[s.kind].toStaff && s.audienceRoles.length === 0) { setError('Choose who should get this alert.'); return; }
    const err = await alertScheduleService.save(s);
    if (err) setError(err); else await load();
  };

  const addRecommended = async () => {
    setBusy(true);
    for (const r of RECOMMENDED) await alertScheduleService.save(r);
    await load();
    setBusy(false);
  };

  const addOne = async () => {
    const base = RECOMMENDED.find((r) => r.kind === addKind)!;
    await save({ ...base });
  };

  if (!items) {
    return <p className="text-xs text-[var(--text-muted)] flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Loading timed alerts…</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">Timed phone alerts</p>
        <p className="text-xs text-[var(--text-muted)]">Sent automatically at your times, even when the app is closed. Times are checked every 15 minutes.</p>
      </div>

      {items.length === 0 && (
        <button type="button" onClick={addRecommended} disabled={busy} className="btn-premium text-xs flex items-center gap-1.5 px-3 py-2 disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Add recommended alerts
        </button>
      )}

      {items.map((s) => (
        <ScheduleCard
          key={s.id}
          value={s}
          onSave={save}
          onDelete={async () => { if (s.id && (await alertScheduleService.remove(s.id))) load(); }}
        />
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <select value={addKind} onChange={(e) => setAddKind(e.target.value as AlertKind)} className="input-premium text-xs">
          {(Object.keys(ALERT_KIND_INFO) as AlertKind[]).map((k) => (
            <option key={k} value={k}>{ALERT_KIND_INFO[k].title}</option>
          ))}
        </select>
        <button type="button" onClick={addOne} className="btn-ghost text-xs flex items-center gap-1"><Plus size={12} /> Add alert</button>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};

export default AlertSchedulesPanel;

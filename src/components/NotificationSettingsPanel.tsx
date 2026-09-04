import React, { useCallback, useEffect, useState } from 'react';
import { Bell, Loader2, Check, Send, History, AlertTriangle, Clock } from 'lucide-react';
import {
  notificationAlertsService,
  type NotificationPreferences,
  type NotificationLogEntry,
} from '../services/notificationAlertsService';

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'UTC'];

const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }> = ({
  checked,
  onChange,
  label,
  hint,
}) => (
  <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)] gap-3">
    <div className="flex-1">
      <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
      <p className="text-xs text-[var(--text-muted)]">{hint}</p>
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${checked ? 'bg-blue-500' : 'bg-gray-400/40'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  </div>
);

export const NotificationSettingsPanel: React.FC = () => {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [logs, setLogs] = useState<NotificationLogEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    notificationAlertsService.getPreferences().then((p) => {
      setPrefs(p);
      setLoading(false);
    });
  }, []);

  const loadLogs = useCallback(async () => {
    setLogs(await notificationAlertsService.getLog(30));
  }, []);

  useEffect(() => {
    if (showLog) loadLogs();
  }, [showLog, loadLogs]);

  const update = async (patch: Partial<NotificationPreferences>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    const ok = await notificationAlertsService.savePreferences(next);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      if (!next.id) {
        setPrefs(await notificationAlertsService.getPreferences());
      }
    } else {
      setError('Could not save notification settings.');
    }
  };

  const runNow = async (kind: 'summary' | 'salary') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'summary') {
        await notificationAlertsService.sendDailySummaryNow();
      } else {
        const now = new Date();
        await notificationAlertsService.broadcastSalaryCredit({
          monthYear: `${now.toLocaleString(undefined, { month: 'long' })} ${now.getFullYear()}`,
        });
      }
      if (showLog) loadLogs();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (loading || !prefs) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Loader2 size={14} className="animate-spin" /> Loading notification settings…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Toggle
        label="Daily attendance summary"
        hint="Send a push summary of today's attendance to admins and managers."
        checked={prefs.dailyAttendanceEnabled}
        onChange={(v) => update({ dailyAttendanceEnabled: v })}
      />

      {prefs.dailyAttendanceEnabled && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)]">
          <label className="text-xs text-[var(--text-muted)] space-y-1">
            <span className="flex items-center gap-1"><Clock size={12} /> Preferred time</span>
            <input
              type="time"
              value={prefs.dailyAttendanceTime}
              onChange={(e) => update({ dailyAttendanceTime: e.target.value })}
              className="input-premium w-full"
            />
          </label>
          <label className="text-xs text-[var(--text-muted)] space-y-1">
            <span>Time zone</span>
            <select
              value={prefs.timezone}
              onChange={(e) => update({ timezone: e.target.value })}
              className="input-premium w-full"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <Toggle
        label="Uninformed absence alerts"
        hint="Notify admins immediately when any location marks a staff member uninformed absent."
        checked={prefs.uninformedLeaveEnabled}
        onChange={(v) => update({ uninformedLeaveEnabled: v })}
      />

      <Toggle
        label="Salary credit notifications"
        hint="Notify every staff member when their salary is disbursed."
        checked={prefs.salaryCreditEnabled}
        onChange={(v) => update({ salaryCreditEnabled: v })}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => runNow('summary')}
          disabled={busy !== null}
          className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50"
        >
          {busy === 'summary' ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          Send attendance summary now
        </button>
        <button
          type="button"
          onClick={() => runNow('salary')}
          disabled={busy !== null}
          className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50"
        >
          {busy === 'salary' ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
          Broadcast salary credit
        </button>
        <button
          type="button"
          onClick={() => setShowLog((v) => !v)}
          className="btn-secondary text-xs flex items-center gap-1.5"
        >
          <History size={12} /> {showLog ? 'Hide' : 'View'} notification log
        </button>
      </div>

      {saved && (
        <p className="text-xs text-emerald-500 flex items-center gap-1"><Check size={12} /> Saved</p>
      )}
      {error && (
        <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12} /> {error}</p>
      )}

      {showLog && (
        <div className="rounded-lg border border-[var(--glass-border)] divide-y divide-[var(--glass-border)] max-h-72 overflow-y-auto">
          {logs.length === 0 ? (
            <p className="p-3 text-xs text-[var(--text-muted)]">No notifications sent yet.</p>
          ) : (
            logs.map((l) => (
              <div key={l.id} className="p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[var(--text-primary)] truncate">{l.title}</p>
                  <p className="text-[11px] text-[var(--text-muted)] line-clamp-2">{l.body}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-[var(--text-muted)]">{new Date(l.createdAt).toLocaleString()}</p>
                  <p className="text-[10px] text-blue-500">{l.pushCount} device(s) · {l.category}</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationSettingsPanel;

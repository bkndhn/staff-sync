import React, { useEffect, useState } from 'react';
import { getAlertMutes, setAlertMute, type MuteKind } from '../services/fcmPushService';

const LABELS: Record<MuteKind, { title: string; hint: string }> = {
  punch: { title: 'Punch IN / OUT alerts', hint: 'A message each time your punch is saved.' },
  reminder: { title: 'Punch reminders', hint: 'Reminders before your shift starts and ends.' },
  report: { title: 'Attendance & work reports', hint: 'Timed reports and reminders for managers.' },
};

/** Lets a person turn alert groups on or off on all of their phones. */
export const PhoneAlertSwitches: React.FC<{ kinds: MuteKind[] }> = ({ kinds }) => {
  const [muted, setMuted] = useState<MuteKind[] | null>(null);
  const [devices, setDevices] = useState(0);

  useEffect(() => {
    getAlertMutes().then((r) => { if (r) { setMuted(r.muted); setDevices(r.devices); } });
  }, []);

  if (!muted || devices === 0) return null;

  const flip = async (k: MuteKind) => {
    const nowMuted = !muted.includes(k);
    setMuted(nowMuted ? [...muted, k] : muted.filter((x) => x !== k));
    const r = await setAlertMute(k, nowMuted);
    if (r) setMuted(r.muted);
  };

  return (
    <div className="space-y-2">
      {kinds.map((k) => {
        const on = !muted.includes(k);
        return (
          <div key={k} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--glass-border)]">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">{LABELS[k].title}</p>
              <p className="text-xs text-[var(--text-muted)]">{LABELS[k].hint}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={LABELS[k].title}
              onClick={() => flip(k)}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${on ? 'bg-[hsl(var(--primary))]' : 'bg-[var(--glass-border)]'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-[hsl(var(--background))] shadow transition-transform ${on ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default PhoneAlertSwitches;

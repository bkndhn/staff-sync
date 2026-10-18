import React, { useEffect, useState } from 'react';
import { Coffee, Pause, Play, Loader2, AlertTriangle } from 'lucide-react';
import { breakTypeService, breakEventService } from '../services/breakService';
import { BreakType, BreakEvent, Staff } from '../types';

interface Props {
  staff: Staff;
  source?: 'web' | 'mobile';
  performedBy?: string;
  compact?: boolean;
  onChanged?: () => void;
}

const BreakControls: React.FC<Props> = ({ staff, source = 'web', performedBy, compact, onChanged }) => {
  const [types, setTypes] = useState<BreakType[]>([]);
  const [openBreak, setOpenBreak] = useState<BreakEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [elapsedTick, setElapsedTick] = useState(0);

  useEffect(() => {
    breakTypeService.list(true).then(setTypes);
    breakEventService.openBreak(staff.id).then(setOpenBreak);
  }, [staff.id]);

  useEffect(() => {
    if (!openBreak) return;
    const t = setInterval(() => setElapsedTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [openBreak]);

  void elapsedTick;
  const elapsedSec = openBreak
    ? Math.max(0, Math.floor((Date.now() - new Date(`${openBreak.date}T${openBreak.startTime}`).getTime()) / 1000))
    : 0;
  const elapsedMin = Math.floor(elapsedSec / 60);
  const activeType = openBreak ? types.find(t => t.id === openBreak.breakTypeId) : null;
  const limitSec = (activeType?.maxMinutes || 0) * 60;
  const overLimit = activeType ? elapsedMin >= activeType.maxMinutes : false;
  const remainSec = limitSec - elapsedSec;
  const fmt = (sec: number) => `${Math.floor(Math.abs(sec) / 60)}:${String(Math.abs(sec) % 60).padStart(2, '0')}`;
  const pct = limitSec ? Math.min(100, (elapsedSec / limitSec) * 100) : 0;

  // Chime at 5 minutes left and when the limit is reached (once each per break).
  useEffect(() => {
    if (!openBreak || !limitSec) return;
    const fire = (kind: string, freq: number) => {
      const key = `brk:${openBreak.id}:${kind}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        [0, 0.35].forEach(t => {
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
          g.gain.setValueAtTime(0.25, ctx.currentTime + t);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
          o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
        });
        navigator.vibrate?.([200, 100, 200]);
      } catch { /* audio unavailable */ }
    };
    if (remainSec <= 300 && remainSec > 0 && limitSec > 300) fire('warn', 660);
    if (remainSec <= 0) fire('over', 880);
  }, [openBreak, limitSec, remainSec]);

  const startBreak = async (type: BreakType) => {
    setLoading(true);
    const ev = await breakEventService.start({
      staffId: staff.id, staffName: staff.name, location: staff.location,
      breakType: type, source, createdBy: performedBy || staff.name,
    });
    if (ev) setOpenBreak(ev);
    setLoading(false);
    setPickerOpen(false);
    onChanged?.();
  };

  const endBreak = async () => {
    if (!openBreak) return;
    setLoading(true);
    const type = types.find(t => t.id === openBreak.breakTypeId);
    await breakEventService.end({
      eventId: openBreak.id, staffId: staff.id, staffName: staff.name,
      breakType: type, createdBy: performedBy || staff.name,
    });
    setOpenBreak(null);
    setLoading(false);
    onChanged?.();
  };

  if (openBreak) {
    return (
      <div className={`rounded-2xl border ${overLimit ? 'border-red-500/40 bg-red-500/10' : 'border-amber-500/40 bg-amber-500/10'} p-4 ${compact ? '' : 'space-y-3'}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Coffee size={18} className={overLimit ? 'text-red-500' : 'text-amber-500'} />
            <div>
              <div className="text-sm font-semibold">On break: {activeType?.name || 'Break'}</div>
              <div className="text-xs text-[var(--text-muted)]">
                Started {openBreak.startTime.slice(0, 5)} · {fmt(elapsedSec)} elapsed
                {activeType && ` / ${activeType.maxMinutes}m max`}
              </div>
              {limitSec > 0 && (
                <div className={`text-2xl font-black tabular-nums ${overLimit ? 'text-red-500' : remainSec <= 300 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {overLimit ? `+${fmt(remainSec)} over` : `${fmt(remainSec)} left`}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={endBreak}
            disabled={loading}
            className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            End Break
          </button>
        </div>
        {limitSec > 0 && (
          <div className="h-1.5 rounded-full bg-black/10 overflow-hidden mt-2">
            <div className={`h-full transition-all ${overLimit ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
          </div>
        )}
        {overLimit && (
          <div className="flex items-center gap-1.5 text-xs text-red-500">
            <AlertTriangle size={12} /> Break limit exceeded — will be flagged as violation.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setPickerOpen(p => !p)}
        disabled={loading || types.length === 0}
        className="w-full px-3 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-600 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Pause size={16} /> Start Break
      </button>
      {pickerOpen && (
        <div className="grid grid-cols-1 gap-2 p-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]">
          {types.map(t => (
            <button
              key={t.id}
              onClick={() => startBreak(t)}
              disabled={loading}
              className="text-left px-3 py-2 rounded-lg hover:bg-white/5 border border-transparent hover:border-[var(--glass-border)] disabled:opacity-50"
            >
              <div className="text-sm font-semibold">{t.name}</div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Default {t.defaultMinutes}m · max {t.maxMinutes}m · {t.isPaid ? 'Paid' : 'Unpaid'}
              </div>
            </button>
          ))}
          {types.length === 0 && (
            <div className="text-xs text-[var(--text-muted)] p-2">No break types configured.</div>
          )}
        </div>
      )}
    </div>
  );
};

export default BreakControls;

import React, { useEffect, useState } from 'react';
import { Coffee, AlertTriangle, Clock, Users } from 'lucide-react';
import { breakEventService } from '../services/breakService';
import { BreakEvent } from '../types';

interface Props { location?: string; }

const BreaksDashboardWidget: React.FC<Props> = ({ location }) => {
  const [events, setEvents] = useState<BreakEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const today = new Date().toISOString().slice(0, 10);
      const ev = await breakEventService.list({ date: today, location });
      setEvents(ev);
      setLoading(false);
    };
    load();
    const t = setInterval(load, 60 * 1000);
    return () => clearInterval(t);
  }, [location]);

  const s = breakEventService.summarize(events);
  const onBreakNow = events.filter(e => !e.endTime);

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Coffee size={18} className="text-amber-500" />
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Breaks Today</h3>
        {loading && <span className="text-[10px] text-[var(--text-muted)]">loading…</span>}
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <Mini icon={Users} value={s.onBreak} label="On break" />
        <Mini icon={Coffee} value={s.count} label="Total" />
        <Mini icon={Clock} value={`${s.totalMinutes}m`} label="Minutes" />
        <Mini icon={AlertTriangle} value={s.violations} label="Violations" danger={s.violations > 0} />
      </div>
      {onBreakNow.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-auto">
          {onBreakNow.slice(0, 5).map(e => (
            <div key={e.id} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-white/5">
              <span className="font-semibold">{e.staffName}</span>
              <span className="text-[var(--text-muted)] capitalize">{e.breakTypeCode} · {e.startTime.slice(0, 5)}</span>
            </div>
          ))}
          {onBreakNow.length > 5 && <div className="text-[11px] text-[var(--text-muted)] text-center">+{onBreakNow.length - 5} more</div>}
        </div>
      )}
    </div>
  );
};

const Mini: React.FC<{ icon: React.ElementType; value: number | string; label: string; danger?: boolean }> = ({ icon: Icon, value, label, danger }) => (
  <div className={`rounded-xl p-2 ${danger ? 'bg-red-500/15 text-red-500' : 'bg-white/5'}`}>
    <Icon size={14} className="mx-auto mb-0.5" />
    <div className="text-base font-bold">{value}</div>
    <div className="text-[9px] uppercase opacity-70">{label}</div>
  </div>
);

export default BreaksDashboardWidget;

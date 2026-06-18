import React, { useEffect, useMemo, useState } from 'react';
import { Coffee, AlertTriangle, Clock, Users, TrendingUp } from 'lucide-react';
import { breakEventService } from '../services/breakService';
import { BreakEvent } from '../types';

interface Props { location?: string; }

const BreaksDashboardWidget: React.FC<Props> = ({ location }) => {
  const [events, setEvents] = useState<BreakEvent[]>([]);
  const [weekEvents, setWeekEvents] = useState<BreakEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const weekAgoStr = weekAgo.toISOString().slice(0, 10);

    const load = async () => {
      const [todayEv, weekEv] = await Promise.all([
        breakEventService.list({ date: todayStr, location }),
        breakEventService.list({ startDate: weekAgoStr, endDate: todayStr, location }),
      ]);
      setEvents(todayEv);
      setWeekEvents(weekEv);
      setLoading(false);
    };
    load();
    const t = setInterval(load, 60 * 1000);
    return () => clearInterval(t);
  }, [location]);

  const s = useMemo(() => breakEventService.summarize(events), [events]);
  const onBreakNow = useMemo(() => events.filter(e => !e.endTime), [events]);

  // 7-day mini trend
  const trend = useMemo(() => {
    const days: { date: string; label: string; minutes: number; count: number }[] = [];
    const map = new Map<string, { minutes: number; count: number }>();
    for (const e of weekEvents) {
      const m = map.get(e.date) || { minutes: 0, count: 0 };
      m.minutes += e.durationMinutes || 0;
      m.count += 1;
      map.set(e.date, m);
    }
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().slice(0, 10);
      const v = map.get(ds) || { minutes: 0, count: 0 };
      days.push({
        date: ds,
        label: d.toLocaleDateString('en-US', { weekday: 'short' })[0],
        minutes: v.minutes,
        count: v.count,
      });
    }
    return days;
  }, [weekEvents]);

  const maxTrendMin = Math.max(1, ...trend.map(t => t.minutes));

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Coffee size={18} className="text-amber-500" />
        <h3 className="text-sm font-bold text-[var(--text-primary)]">Breaks Today</h3>
        {loading && <span className="text-[10px] text-[var(--text-muted)]">loading…</span>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
        <Mini icon={Users} value={s.onBreak} label="On break" highlight={s.onBreak > 0} />
        <Mini icon={Coffee} value={s.count} label="Total" />
        <Mini icon={Clock} value={`${s.totalMinutes}m`} label="Minutes" />
        <Mini icon={TrendingUp} value={`${s.avgMinutes}m`} label="Avg" />
        <Mini icon={AlertTriangle} value={s.violations} label="Violations" danger={s.violations > 0} />
      </div>

      {/* By-type breakdown */}
      {Object.keys(s.byType).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(s.byType).map(([code, v]) => (
            <span key={code} className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-[var(--text-secondary)] capitalize">
              <b className="text-[var(--text-primary)]">{code}</b> {v.count}·{v.minutes}m
            </span>
          ))}
        </div>
      )}

      {/* 7-day trend */}
      <div>
        <div className="text-[10px] uppercase text-[var(--text-muted)] mb-1 flex items-center justify-between">
          <span>Last 7 days · break minutes</span>
          <span className="font-bold">{trend.reduce((a, b) => a + b.minutes, 0)}m</span>
        </div>
        <div className="flex items-end gap-1 h-12">
          {trend.map(d => (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-0.5">
              <div
                className="w-full rounded-t bg-amber-500/60 hover:bg-amber-500 transition-all min-h-[2px]"
                style={{ height: `${(d.minutes / maxTrendMin) * 100}%` }}
                title={`${d.date}: ${d.count} breaks, ${d.minutes}m`}
              />
              <span className="text-[8px] text-[var(--text-muted)]">{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Currently on break */}
      {onBreakNow.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-auto pt-1 border-t border-white/10">
          <div className="text-[10px] uppercase text-[var(--text-muted)]">Currently on break</div>
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

const Mini: React.FC<{ icon: React.ElementType; value: number | string; label: string; danger?: boolean; highlight?: boolean }> = ({ icon: Icon, value, label, danger, highlight }) => (
  <div className={`rounded-xl p-2 ${danger ? 'bg-red-500/15 text-red-500' : highlight ? 'bg-amber-500/20 text-amber-500' : 'bg-white/5'}`}>
    <Icon size={14} className="mx-auto mb-0.5" />
    <div className="text-base font-bold">{value}</div>
    <div className="text-[9px] uppercase opacity-70">{label}</div>
  </div>
);

export default BreaksDashboardWidget;

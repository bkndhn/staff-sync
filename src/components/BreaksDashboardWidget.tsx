import React, { useEffect, useMemo, useState } from 'react';
import { Coffee, AlertTriangle, Clock, Users, TrendingUp } from 'lucide-react';
import { breakEventService } from '../services/breakService';
import { BreakEvent } from '../types';

interface Props { location?: string; }

const BreaksDashboardWidget: React.FC<Props> = ({ location }) => {
  const [events, setEvents] = useState<BreakEvent[]>([]);
  const [weekEvents, setWeekEvents] = useState<BreakEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const isLight = document.body.classList.contains('light-theme');

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

  // Theme-aware colours — all defined here, no CSS needed
  const c = {
    title:       isLight ? '#0F172A' : '#F8FAFC',
    subtitle:    isLight ? '#64748B' : '#94A3B8',
    accent:      isLight ? '#D97706' : '#F59E0B',
    numDefault:  isLight ? '#0F172A' : '#FFFFFF',
    labelDefault:isLight ? '#475569' : '#CBD5E1',
    trendLabel:  isLight ? '#334155' : '#9CA3AF',
    border:      isLight ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.30)',
    cardBg:      isLight ? 'rgba(245,158,11,0.08)' : 'rgba(245,158,11,0.12)',
    miniBg:      isLight ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.05)',
    miniBorder:  isLight ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.2)',
    badgeBg:     isLight ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.1)',
    badgeText:   isLight ? '#92400E' : '#FDE68A',
    onBreakBg:   isLight ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.05)',
    onBreakBorder: isLight ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.2)',
    staffName:   isLight ? '#0F172A' : '#FFFFFF',
    staffMeta:   isLight ? '#475569' : '#D1D5DB',
  };

  return (
    <div style={{
      borderRadius: '1rem',
      border: `1px solid ${c.border}`,
      background: isLight
        ? 'linear-gradient(135deg, rgba(245,158,11,0.07), rgba(249,115,22,0.04))'
        : 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(249,115,22,0.06))',
      padding: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Coffee size={17} style={{ color: c.accent, flexShrink: 0 }} />
        <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: c.title, margin: 0 }}>Breaks Today</h3>
        {loading && <span style={{ fontSize: '0.625rem', color: c.subtitle }}>loading…</span>}
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
        <MiniStat icon={Users}         value={s.onBreak}          label="On Break"    highlight={s.onBreak > 0}   colours={c} />
        <MiniStat icon={Coffee}        value={s.count}            label="Total"                                   colours={c} />
        <MiniStat icon={Clock}         value={`${s.totalMinutes}m`} label="Minutes"                               colours={c} />
        <MiniStat icon={TrendingUp}    value={`${s.avgMinutes}m`} label="Avg"                                     colours={c} />
        <MiniStat icon={AlertTriangle} value={s.violations}       label="Violations"  danger={s.violations > 0}   colours={c} />
      </div>

      {/* By-type badges */}
      {Object.keys(s.byType).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          {Object.entries(s.byType).map(([code, v]) => (
            <span key={code} style={{
              fontSize: '0.625rem', padding: '2px 8px', borderRadius: '999px',
              background: c.badgeBg, color: c.badgeText, fontWeight: 500, textTransform: 'capitalize',
            }}>
              <b style={{ color: c.title }}>{code}</b> {v.count}·{v.minutes}m
            </span>
          ))}
        </div>
      )}

      {/* 7-day trend */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.625rem', color: c.trendLabel, fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>
          <span>Last 7 days · break minutes</span>
          <span style={{ color: c.title, fontWeight: 700 }}>{trend.reduce((a, b) => a + b.minutes, 0)}m</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '48px' }}>
          {trend.map(d => (
            <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }}>
              <div
                style={{
                  width: '100%', borderRadius: '3px 3px 0 0', minHeight: '2px',
                  background: isLight ? 'rgba(245,158,11,0.55)' : 'rgba(245,158,11,0.6)',
                  height: `${(d.minutes / maxTrendMin) * 100}%`,
                }}
                title={`${d.date}: ${d.count} breaks, ${d.minutes}m`}
              />
              <span style={{ fontSize: '0.5rem', color: c.trendLabel, fontWeight: 700 }}>{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Currently on break list */}
      {onBreakNow.length > 0 && (
        <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '160px', overflowY: 'auto' }}>
          <div style={{ fontSize: '0.625rem', textTransform: 'uppercase', fontWeight: 600, color: c.subtitle }}>Currently on break</div>
          {onBreakNow.slice(0, 5).map(e => (
            <div key={e.id} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '6px 8px', borderRadius: '8px',
              background: c.onBreakBg, border: `1px solid ${c.onBreakBorder}`,
              fontSize: '0.75rem',
            }}>
              <span style={{ fontWeight: 600, color: c.staffName }}>{e.staffName}</span>
              <span style={{ color: c.staffMeta, textTransform: 'capitalize' }}>{e.breakTypeCode} · {e.startTime.slice(0, 5)}</span>
            </div>
          ))}
          {onBreakNow.length > 5 && <div style={{ fontSize: '0.6875rem', color: c.subtitle, textAlign: 'center' }}>+{onBreakNow.length - 5} more</div>}
        </div>
      )}
    </div>
  );
};

const MiniStat: React.FC<{
  icon: React.ElementType; value: number | string; label: string;
  danger?: boolean; highlight?: boolean; colours: Record<string, string>;
}> = ({ icon: Icon, value, label, danger, highlight, colours: c }) => {
  const bg = danger ? 'rgba(239,68,68,0.12)' : highlight ? 'rgba(245,158,11,0.18)' : c.miniBg;
  const numColor = danger ? (document.body.classList.contains('light-theme') ? '#B91C1C' : '#FCA5A5')
    : highlight ? (document.body.classList.contains('light-theme') ? '#92400E' : '#FCD34D')
    : c.numDefault;
  return (
    <div style={{
      borderRadius: '0.75rem', padding: '0.5rem', border: `1px solid ${c.miniBorder}`,
      background: bg, textAlign: 'center',
    }}>
      <Icon size={13} style={{ color: numColor, margin: '0 auto 2px' }} />
      <div style={{ fontSize: '1rem', fontWeight: 700, color: numColor }}>{value}</div>
      <div style={{ fontSize: '0.5625rem', textTransform: 'uppercase', fontWeight: 600, color: c.labelDefault }}>{label}</div>
    </div>
  );
};

export default BreaksDashboardWidget;

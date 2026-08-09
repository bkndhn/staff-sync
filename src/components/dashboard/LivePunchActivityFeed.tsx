import React from 'react';
import { Activity, Clock, CheckCircle, ShieldCheck, MapPin } from 'lucide-react';
import { Attendance, Staff } from '../../types';

interface LivePunchActivityFeedProps {
  todayAttendance: Attendance[];
  staff: Staff[];
}

export const LivePunchActivityFeed: React.FC<LivePunchActivityFeedProps> = ({ todayAttendance, staff }) => {
  const activePunches = React.useMemo(() => {
    return todayAttendance
      .filter(a => a.arrivalTime && (a.status === 'Present' || a.status === 'Half Day'))
      .sort((a, b) => (b.arrivalTime || '').localeCompare(a.arrivalTime || ''))
      .slice(0, 10);
  }, [todayAttendance]);

  const fmt12h = (t?: string) => {
    if (!t) return '—';
    const [hh, mm] = t.split(':');
    let h = parseInt(hh, 10);
    const m = mm || '00';
    if (isNaN(h)) return t;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
  };

  const isLight = document.body.classList.contains('light-theme');
  const c = {
    title: isLight ? '#0F172A' : '#F8FAFC',
    subtitle: isLight ? '#475569' : '#94A3B8',
    emeraldBg: isLight ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.2)',
    emeraldBorder: isLight ? 'rgba(16, 185, 129, 0.3)' : 'rgba(16, 185, 129, 0.3)',
    emeraldText: isLight ? '#10b981' : '#34d399',
    emeraldTextDark: isLight ? '#047857' : '#34d399',
    emeraldBgSub: isLight ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.1)',
    cardBg: isLight ? '#f9fafb' : 'rgba(255,255,255,0.05)',
    indigoText: isLight ? '#4f46e5' : '#818cf8',
    indigoTextDark: isLight ? '#3730a3' : '#a5b4fc',
    indigoBgSub: isLight ? '#e0e7ff' : 'rgba(99, 102, 241, 0.2)',
    indigoBorderSub: isLight ? '#a5b4fc' : 'rgba(99, 102, 241, 0.3)',
  };

  return (
    <div className="glass-card-static p-4 sm:p-5 rounded-2xl shadow-lg" style={{ border: '1px solid var(--glass-border)' }}>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: c.emeraldBg, borderColor: c.emeraldBorder, borderWidth: 1, color: c.emeraldText }}>
            <Activity size={20} className="animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: c.title }}>Real-Time Punch Stream</h3>
            <p className="text-xs" style={{ color: c.subtitle }}>Live check-in events for today</p>
          </div>
        </div>
        <span className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ color: c.emeraldTextDark, backgroundColor: c.emeraldBgSub, borderColor: c.emeraldBorder, borderWidth: 1 }}>
          <span className="w-2 h-2 rounded-full animate-ping" style={{ backgroundColor: c.emeraldText }}></span> Live
        </span>
      </div>
      {activePunches.length === 0 ? (
        <div className="p-6 text-center border-dashed rounded-xl" style={{ borderColor: 'var(--glass-border)', borderWidth: 1 }}>
          <p className="text-xs" style={{ color: c.subtitle }}>No punch events recorded for today yet.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {activePunches.map(p => {
            const sm = staff.find(s => s.id === p.staffId);
            const name = p.staffName || sm?.name || 'Staff Member';
            const loc = p.location || sm?.location || 'Branch';
            return (
              <div key={p.id || `${p.staffId}-${p.date}`} className="flex items-center justify-between p-2.5 rounded-xl transition-all text-xs hover:border-emerald-500/30" style={{ backgroundColor: c.cardBg, border: '1px solid var(--glass-border)' }}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: c.emeraldBg, color: c.emeraldTextDark }}>
                    <CheckCircle size={14} />
                  </div>
                  <div className="truncate">
                    <p className="font-semibold truncate" style={{ color: c.title }}>{name}</p>
                    <p className="text-[10px] flex items-center gap-1" style={{ color: c.subtitle }}>
                      <MapPin size={10} style={{ color: c.indigoText }} /> {loc}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-mono font-bold block" style={{ color: c.emeraldTextDark }}>{fmt12h(p.arrivalTime)}</span>
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ color: c.indigoTextDark, backgroundColor: c.indigoBgSub, borderColor: c.indigoBorderSub, borderWidth: 1 }}>
                    <ShieldCheck size={9} /> Verified
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LivePunchActivityFeed;

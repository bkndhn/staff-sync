import React from 'react';
import { Clock, AlertTriangle, MessageCircle, CheckCircle2 } from 'lucide-react';
import { Attendance, Staff } from '../../types';

interface PunctualityMetricsWidgetProps {
  todayAttendance: Attendance[];
  staff: Staff[];
}

export const PunctualityMetricsWidget: React.FC<PunctualityMetricsWidgetProps> = ({ todayAttendance, staff }) => {
  const lateCutoff = '09:30';

  const lateRecords = React.useMemo(() => {
    return todayAttendance.filter(a => {
      if (!a.arrivalTime || a.status === 'Absent') return false;
      return a.arrivalTime > lateCutoff;
    });
  }, [todayAttendance, lateCutoff]);

  const presentRecords = todayAttendance.filter(a => a.status === 'Present' || a.status === 'Half Day');
  const onTimeCount = Math.max(0, presentRecords.length - lateRecords.length);
  const onTimeRate = presentRecords.length > 0 ? Math.round((onTimeCount / presentRecords.length) * 100) : 100;

  const handleSendLateWhatsApp = (sName: string, phone?: string, time?: string) => {
    const text = `Hi ${sName}, you logged in late today at ${time} (Expected before 9:30 AM). Please ensure punctual arrival.`;
    const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
    const url = cleanPhone.length === 10 ? `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

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
    amberBg: isLight ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.2)',
    amberBorder: isLight ? 'rgba(245, 158, 11, 0.3)' : 'rgba(245, 158, 11, 0.3)',
    amberText: isLight ? '#f59e0b' : '#fbbf24',
    amberTextDark: isLight ? '#b45309' : '#fbbf24',
    amberBgSub: isLight ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.1)',
    emeraldBgSub: isLight ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.1)',
    emeraldBorderSub: isLight ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.2)',
    emeraldTextDark: isLight ? '#047857' : '#34d399',
    cardBg: isLight ? '#f9fafb' : 'rgba(255,255,255,0.05)',
    greenBtnBg: isLight ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.2)',
    greenBtnBorder: isLight ? 'rgba(34, 197, 94, 0.3)' : 'rgba(34, 197, 94, 0.3)',
    greenBtnText: isLight ? '#15803d' : '#4ade80',
  };

  return (
    <div className="glass-card-static p-4 sm:p-5 rounded-2xl shadow-lg" style={{ border: '1px solid var(--glass-border)' }}>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: c.amberBg, borderColor: c.amberBorder, borderWidth: 1, color: c.amberText }}>
            <Clock size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: c.title }}>Punctuality Intelligence</h3>
            <p className="text-xs" style={{ color: c.subtitle }}>Arrival timeliness monitoring</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xl font-extrabold" style={{ color: c.amberTextDark }}>{onTimeRate}%</span>
          <span className="text-[10px] block uppercase font-semibold" style={{ color: c.subtitle }}>On-Time Rate</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="p-2.5 rounded-xl text-center" style={{ backgroundColor: c.emeraldBgSub, borderColor: c.emeraldBorderSub, borderWidth: 1 }}>
          <span className="text-xs block" style={{ color: c.subtitle }}>On-Time Arrivals</span>
          <span className="text-lg font-bold" style={{ color: c.emeraldTextDark }}>{onTimeCount}</span>
        </div>
        <div className="p-2.5 rounded-xl text-center" style={{ backgroundColor: c.amberBgSub, borderColor: c.amberBorder, borderWidth: 1 }}>
          <span className="text-xs block" style={{ color: c.subtitle }}>Late Arrivals</span>
          <span className="text-lg font-bold" style={{ color: c.amberTextDark }}>{lateRecords.length}</span>
        </div>
      </div>
      {lateRecords.length > 0 && (
        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 pt-3" style={{ borderTop: '1px solid var(--glass-border)' }}>
          <span className="text-[11px] font-bold uppercase tracking-wider block mb-1" style={{ color: c.amberTextDark }}>Late Arrivals Today</span>
          {lateRecords.map(r => {
            const sm = staff.find(s => s.id === r.staffId);
            const name = r.staffName || sm?.name || 'Staff';
            return (
              <div key={r.id || r.staffId} className="flex items-center justify-between p-2 rounded-xl text-xs" style={{ backgroundColor: c.cardBg, border: '1px solid var(--glass-border)' }}>
                <div>
                  <span className="font-semibold block" style={{ color: c.title }}>{name}</span>
                  <span className="text-[10px] font-mono" style={{ color: c.amberTextDark }}>Arrived: {fmt12h(r.arrivalTime)}</span>
                </div>
                <button
                  onClick={() => handleSendLateWhatsApp(name, sm?.contactNumber, fmt12h(r.arrivalTime))}
                  className="px-2 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-1 transition-colors"
                  style={{ backgroundColor: c.greenBtnBg, borderColor: c.greenBtnBorder, borderWidth: 1, color: c.greenBtnText }}
                  title="Send WhatsApp Late Notice"
                >
                  <MessageCircle size={12} /> Ping
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PunctualityMetricsWidget;

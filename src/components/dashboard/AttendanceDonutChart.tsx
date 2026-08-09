import React from 'react';
import { PieChart, CheckCircle2, Clock, XCircle, AlertTriangle } from 'lucide-react';

interface AttendanceDonutChartProps {
  present: number;
  halfDay: number;
  absent: number;
  uninformed: number;
  totalStaff: number;
}

export const AttendanceDonutChart: React.FC<AttendanceDonutChartProps> = ({
  present,
  halfDay,
  absent,
  uninformed,
  totalStaff
}) => {
  const totalTracked = Math.max(1, present + halfDay + absent);
  const presentPct = Math.round((present / totalTracked) * 100);
  const halfDayPct = Math.round((halfDay / totalTracked) * 100);
  const absentPct = Math.round((absent / totalTracked) * 100);

  const radius = 65;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;
  const presentOffset = 0;
  const presentDash = (present / totalTracked) * circumference;
  const halfDayOffset = presentDash;
  const halfDayDash = (halfDay / totalTracked) * circumference;
  const absentOffset = presentDash + halfDayDash;
  const absentDash = (absent / totalTracked) * circumference;

  const isLight = document.body.classList.contains('light-theme');
  const c = {
    title: isLight ? '#0F172A' : '#F8FAFC',
    subtitle: isLight ? '#475569' : '#94A3B8',
    purpleBg: isLight ? 'rgba(168, 85, 247, 0.2)' : 'rgba(168, 85, 247, 0.2)',
    purpleBorder: isLight ? 'rgba(168, 85, 247, 0.3)' : 'rgba(168, 85, 247, 0.3)',
    purpleTextDark: isLight ? '#7e22ce' : '#c084fc',
    purpleText: isLight ? '#a855f7' : '#c084fc',
    emeraldBg: isLight ? 'rgba(16, 185, 129, 0.1)' : 'rgba(16, 185, 129, 0.1)',
    emeraldBorder: isLight ? 'rgba(16, 185, 129, 0.2)' : 'rgba(16, 185, 129, 0.2)',
    emeraldTextDark: isLight ? '#047857' : '#34d399',
    emeraldText: isLight ? '#10b981' : '#34d399',
    amberBg: isLight ? 'rgba(245, 158, 11, 0.1)' : 'rgba(245, 158, 11, 0.1)',
    amberBorder: isLight ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.2)',
    amberTextDark: isLight ? '#b45309' : '#fbbf24',
    amberText: isLight ? '#f59e0b' : '#fbbf24',
    roseBg: isLight ? 'rgba(244, 63, 94, 0.1)' : 'rgba(244, 63, 94, 0.1)',
    roseBorder: isLight ? 'rgba(244, 63, 94, 0.2)' : 'rgba(244, 63, 94, 0.2)',
    roseTextDark: isLight ? '#be123c' : '#fb7185',
    roseText: isLight ? '#f43f5e' : '#fb7185',
    orangeBg: isLight ? 'rgba(249, 115, 22, 0.1)' : 'rgba(249, 115, 22, 0.1)',
    orangeBorder: isLight ? 'rgba(249, 115, 22, 0.2)' : 'rgba(249, 115, 22, 0.2)',
    orangeTextDark: isLight ? '#c2410c' : '#fb923c',
    orangeText: isLight ? '#f97316' : '#fb923c',
  };

  return (
    <div className="glass-card-static p-4 sm:p-5 rounded-2xl shadow-lg flex flex-col justify-between" style={{ border: '1px solid var(--glass-border)' }}>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: c.purpleBg, borderColor: c.purpleBorder, borderWidth: 1, color: c.purpleText }}>
          <PieChart size={20} />
        </div>
        <div>
          <h3 className="text-base font-bold" style={{ color: c.title }}>Attendance Breakdown</h3>
          <p className="text-xs" style={{ color: c.subtitle }}>Distribution for selected date</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
        <div className="relative flex items-center justify-center py-2">
          <svg width="170" height="170" viewBox="0 0 170 170" className="transform -rotate-90">
            <circle cx="85" cy="85" r={radius} fill="transparent" stroke="var(--glass-border)" strokeWidth={strokeWidth} />
            {present > 0 && <circle cx="85" cy="85" r={radius} fill="transparent" stroke="#10b981" strokeWidth={strokeWidth} strokeDasharray={`${presentDash} ${circumference}`} strokeDashoffset={-presentOffset} className="transition-all duration-700 ease-out hover:opacity-80" />}
            {halfDay > 0 && <circle cx="85" cy="85" r={radius} fill="transparent" stroke="#f59e0b" strokeWidth={strokeWidth} strokeDasharray={`${halfDayDash} ${circumference}`} strokeDashoffset={-halfDayOffset} className="transition-all duration-700 ease-out hover:opacity-80" />}
            {absent > 0 && <circle cx="85" cy="85" r={radius} fill="transparent" stroke="#ef4444" strokeWidth={strokeWidth} strokeDasharray={`${absentDash} ${circumference}`} strokeDashoffset={-absentOffset} className="transition-all duration-700 ease-out hover:opacity-80" />}
          </svg>
          <div className="absolute flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-extrabold" style={{ color: c.title }}>{presentPct}%</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: c.subtitle }}>Present</span>
          </div>
        </div>
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between p-2 rounded-xl" style={{ backgroundColor: c.emeraldBg, borderColor: c.emeraldBorder, borderWidth: 1 }}>
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} style={{ color: c.emeraldText }} />
              <span className="font-medium" style={{ color: c.title }}>Present</span>
            </div>
            <span className="font-bold" style={{ color: c.emeraldTextDark }}>{present} <span className="text-[10px]" style={{ color: c.subtitle }}>({presentPct}%)</span></span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-xl" style={{ backgroundColor: c.amberBg, borderColor: c.amberBorder, borderWidth: 1 }}>
            <div className="flex items-center gap-2">
              <Clock size={14} style={{ color: c.amberText }} />
              <span className="font-medium" style={{ color: c.title }}>Half Day</span>
            </div>
            <span className="font-bold" style={{ color: c.amberTextDark }}>{halfDay} <span className="text-[10px]" style={{ color: c.subtitle }}>({halfDayPct}%)</span></span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-xl" style={{ backgroundColor: c.roseBg, borderColor: c.roseBorder, borderWidth: 1 }}>
            <div className="flex items-center gap-2">
              <XCircle size={14} style={{ color: c.roseText }} />
              <span className="font-medium" style={{ color: c.title }}>Absent</span>
            </div>
            <span className="font-bold" style={{ color: c.roseTextDark }}>{absent} <span className="text-[10px]" style={{ color: c.subtitle }}>({absentPct}%)</span></span>
          </div>
          {uninformed > 0 && (
            <div className="flex items-center justify-between p-2 rounded-xl" style={{ backgroundColor: c.orangeBg, borderColor: c.orangeBorder, borderWidth: 1 }}>
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} style={{ color: c.orangeText }} />
                <span className="font-medium" style={{ color: c.orangeTextDark }}>Uninformed</span>
              </div>
              <span className="font-bold" style={{ color: c.orangeTextDark }}>{uninformed}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AttendanceDonutChart;

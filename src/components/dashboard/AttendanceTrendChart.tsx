import React, { useState } from 'react';
import { TrendingUp, Calendar } from 'lucide-react';
import { Attendance } from '../../types';

interface AttendanceTrendChartProps {
  attendance: Attendance[];
  totalActiveStaff: number;
}

export const AttendanceTrendChart: React.FC<AttendanceTrendChartProps> = ({ attendance, totalActiveStaff }) => {
  const [rangeDays, setRangeDays] = useState<7 | 14 | 30>(7);
  const [hoveredPoint, setHoveredPoint] = useState<{ date: string; label?: string; present: number; total?: number; rate: number; index?: number } | null>(null);

  const trendData = React.useMemo(() => {
    const result: { date: string; label: string; present: number; total: number; rate: number }[] = [];
    const today = new Date();
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const dayRecords = attendance.filter(a => a.date === dateStr && !a.isPartTime);
      const presentCount = dayRecords.filter(a => a.status === 'Present' || a.status === 'Half Day').length;
      const baseStaff = totalActiveStaff || Math.max(1, dayRecords.length);
      const rate = Math.min(100, Math.round((presentCount / Math.max(1, baseStaff)) * 100));
      result.push({ date: dateStr, label: dayLabel, present: presentCount, total: baseStaff, rate });
    }
    return result;
  }, [attendance, totalActiveStaff, rangeDays]);

  const svgWidth = 600;
  const svgHeight = 180;
  const paddingX = 40;
  const paddingY = 25;
  const chartW = svgWidth - paddingX * 2;
  const chartH = svgHeight - paddingY * 2;
  const points = trendData.map((d, idx) => {
    const x = paddingX + (idx / Math.max(1, trendData.length - 1)) * chartW;
    const y = paddingY + chartH - (d.rate / 100) * chartH;
    return { x, y, ...d, index: idx };
  });

  const pathD = points.length > 0 ? points.reduce((acc, p, i) => i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, '') : '';
  const areaD = points.length > 0 ? `${pathD} L ${points[points.length - 1].x} ${svgHeight - paddingY} L ${points[0].x} ${svgHeight - paddingY} Z` : '';
  const avgRate = trendData.length ? Math.round(trendData.reduce((sum, d) => sum + d.rate, 0) / trendData.length) : 0;

  const isLight = document.body.classList.contains('light-theme');
  const c = {
    title: isLight ? '#0F172A' : '#F8FAFC',
    subtitle: isLight ? '#475569' : '#94A3B8',
    indigoBg: isLight ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.2)',
    indigoBorder: isLight ? 'rgba(99, 102, 241, 0.3)' : 'rgba(99, 102, 241, 0.3)',
    indigoText: isLight ? '#6366f1' : '#818cf8',
    emeraldTextDark: isLight ? '#047857' : '#34d399',
    buttonBg: isLight ? '#f3f4f6' : 'rgba(255,255,255,0.05)',
  };

  return (
    <div className="glass-card-static p-4 sm:p-5 rounded-2xl shadow-lg relative" style={{ border: '1px solid var(--glass-border)' }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: c.indigoBg, borderColor: c.indigoBorder, borderWidth: 1, color: c.indigoText }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: c.title }}>Attendance Trend Analytics</h3>
            <p className="text-xs" style={{ color: c.subtitle }}>Average Turnout: <span className="font-semibold" style={{ color: c.emeraldTextDark }}>{avgRate}%</span> over last {rangeDays} days</p>
          </div>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-xl self-start sm:self-auto" style={{ backgroundColor: c.buttonBg, border: '1px solid var(--glass-border)' }}>
          {([7, 14, 30] as const).map(days => (
            <button key={days} onClick={() => setRangeDays(days)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${rangeDays === days ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-md' : ''}`} style={rangeDays !== days ? { color: c.subtitle } : {}}>
              {days}D
            </button>
          ))}
        </div>
      </div>
      <div className="relative w-full overflow-hidden">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto overflow-visible">
          <defs>
            <linearGradient id="attendanceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          {[0, 25, 50, 75, 100].map(val => {
            const y = paddingY + chartH - (val / 100) * chartH;
            return (
              <g key={val}>
                <line x1={paddingX} y1={y} x2={svgWidth - paddingX} y2={y} stroke="var(--glass-border)" strokeDasharray="3 3" strokeOpacity="0.5" />
                <text x={paddingX - 8} y={y + 3} textAnchor="end" className="text-[9px] font-mono font-semibold" style={{ fill: c.subtitle }}>{val}%</text>
              </g>
            );
          })}
          <path d={areaD} fill="url(#attendanceGradient)" />
          <path d={pathD} fill="none" stroke="#818cf8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p) => (
            <g key={p.date} className="cursor-pointer" onMouseEnter={() => setHoveredPoint(p)} onMouseLeave={() => setHoveredPoint(null)}>
              <circle cx={p.x} cy={p.y} r="5" className="fill-indigo-500 stroke-white stroke-2 hover:r-7 transition-all" />
              <circle cx={p.x} cy={p.y} r="10" className="fill-transparent hover:fill-indigo-500/20" />
            </g>
          ))}
        </svg>
        {hoveredPoint && (
          <div className="absolute top-2 right-4 bg-slate-900/90 backdrop-blur px-3 py-2 rounded-xl text-xs shadow-2xl z-10 text-white animate-fade-in" style={{ border: '1px solid rgba(99,102,241,0.4)' }}>
            <div className="font-semibold text-indigo-300">{hoveredPoint.label}</div>
            <div className="text-emerald-400 font-bold text-sm">{hoveredPoint.rate}% Attendance</div>
            <div className="text-[11px] text-white/70">{hoveredPoint.present} / {hoveredPoint.total} staff present</div>
          </div>
        )}
      </div>
      <div className="flex justify-between items-center px-8 mt-2 text-[10px] font-mono font-semibold" style={{ color: c.title }}>
        {points.filter((_, idx) => rangeDays === 30 ? idx % 5 === 0 : rangeDays === 14 ? idx % 2 === 0 : true).map(p => (
          <span key={p.date}>{p.label.split(',')[0]}</span>
        ))}
      </div>
    </div>
  );
};

export default AttendanceTrendChart;

import React from 'react';
import { Building2 } from 'lucide-react';
import { Staff, Attendance } from '../../types';

interface BranchComparisonBarChartProps {
  locations: { name: string; color: string; stats: any }[];
  activeStaff: Staff[];
  todayAttendance: Attendance[];
}

export const BranchComparisonBarChart: React.FC<BranchComparisonBarChartProps> = ({ locations, activeStaff, todayAttendance }) => {
  const branchStats = React.useMemo(() => {
    return locations.map(loc => {
      const locStaff = activeStaff.filter(s => s.location === loc.name);
      const locAtt = todayAttendance.filter(r => {
        const s = activeStaff.find(st => st.id === r.staffId);
        return s?.location === loc.name && !r.isPartTime;
      });
      const present = locAtt.filter(r => r.status === 'Present' || r.status === 'Half Day').length;
      const total = Math.max(1, locStaff.length);
      const rate = Math.min(100, Math.round((present / total) * 100));
      return { name: loc.name, present, total: locStaff.length, rate };
    });
  }, [locations, activeStaff, todayAttendance]);

  const isLight = document.body.classList.contains('light-theme');
  const c = {
    title: isLight ? '#0F172A' : '#F8FAFC',
    subtitle: isLight ? '#475569' : '#94A3B8',
    cyanBg: isLight ? 'rgba(6, 182, 212, 0.2)' : 'rgba(6, 182, 212, 0.2)',
    cyanBorder: isLight ? 'rgba(6, 182, 212, 0.3)' : 'rgba(6, 182, 212, 0.3)',
    cyanText: isLight ? '#0891b2' : '#22d3ee',
    cyanTextDark: isLight ? '#0e7490' : '#22d3ee',
    barBg: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.05)',
  };

  return (
    <div className="glass-card-static p-4 sm:p-5 rounded-2xl shadow-lg" style={{ border: '1px solid var(--glass-border)' }}>
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: c.cyanBg, borderColor: c.cyanBorder, borderWidth: 1, color: c.cyanText }}>
          <Building2 size={20} />
        </div>
        <div>
          <h3 className="text-base font-bold" style={{ color: c.title }}>Branch Attendance Comparison</h3>
          <p className="text-xs" style={{ color: c.subtitle }}>Comparative turnout across operating branches</p>
        </div>
      </div>
      <div className="space-y-3.5">
        {branchStats.map(b => (
          <div key={b.name} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-semibold" style={{ color: c.title }}>
              <span className="truncate">{b.name}</span>
              <span className="font-mono font-bold" style={{ color: c.cyanTextDark }}>{b.rate}% <span className="font-normal" style={{ color: c.subtitle }}>({b.present}/{b.total})</span></span>
            </div>
            <div className="w-full h-3 rounded-full overflow-hidden relative" style={{ backgroundColor: c.barBg, border: '1px solid var(--glass-border)' }}>
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all duration-700 ease-out" style={{ width: `${b.rate}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BranchComparisonBarChart;

import React, { useMemo } from 'react';
import { Attendance } from '../types';
import { Calendar, CheckCircle2, MinusCircle, XCircle, Sun, AlertTriangle } from 'lucide-react';

interface Props {
  attendance: Attendance[];
  /** Filter to a single staff (omit for app-wide totals) */
  staffId?: string;
  /** Year to summarize. Defaults to current year. */
  year?: number;
  title?: string;
  compact?: boolean;
}

const YearlyAttendanceSummary: React.FC<Props> = ({
  attendance,
  staffId,
  year,
  title,
  compact = false,
}) => {
  const targetYear = year ?? new Date().getFullYear();

  const stats = useMemo(() => {
    const filtered = attendance.filter(a => {
      if (a.isPartTime) return false;
      if (staffId && a.staffId !== staffId) return false;
      const d = new Date(a.date);
      return !isNaN(d.getTime()) && d.getFullYear() === targetYear;
    });
    let present = 0, half = 0, absent = 0, sundayLeave = 0, uninformed = 0;
    for (const a of filtered) {
      if (a.isSunday && a.status !== 'Present') sundayLeave++;
      if (a.status === 'Present') present++;
      else if (a.status === 'Half Day') half++;
      else if (a.status === 'Absent') {
        absent++;
        if (a.isUninformed) uninformed++;
      }
    }
    return { present, half, absent, sundayLeave, uninformed, total: filtered.length };
  }, [attendance, staffId, targetYear]);

  // Use solid colors that stay readable in BOTH light and dark themes.
  const cards = [
    { label: 'Present',        value: stats.present,     icon: CheckCircle2,  cls: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300' },
    { label: 'Half Day',       value: stats.half,        icon: MinusCircle,   cls: 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300' },
    { label: 'Leave / Absent', value: stats.absent,      icon: XCircle,       cls: 'bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300' },
    { label: 'Sunday Off',     value: stats.sundayLeave, icon: Sun,           cls: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-800 dark:text-yellow-300' },
    { label: 'Uninformed',     value: stats.uninformed,  icon: AlertTriangle, cls: 'bg-orange-500/15 border-orange-500/40 text-orange-700 dark:text-orange-300' },
  ];

  return (
    <div className={`rounded-2xl bg-[var(--bg-card)] border border-[var(--glass-border)] ${compact ? 'p-3' : 'p-4 md:p-5'}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Calendar size={16} className="text-indigo-400" />
          {title ?? `Year ${targetYear} attendance`}
        </h4>
        <span className="text-xs text-[var(--text-secondary)]">{stats.total} records</span>
      </div>
      <div className={`grid gap-2 ${compact ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'}`}>
        {cards.map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} className={`rounded-xl border p-3 ${c.cls}`}>
              <div className="flex items-center justify-between">
                <Icon size={18} className="opacity-90" />
                <span className="text-2xl font-extrabold leading-none">{c.value}</span>
              </div>
              <div className="mt-1 text-[11px] font-bold uppercase tracking-wide">{c.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default YearlyAttendanceSummary;
import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import type { Attendance, Staff } from '../../types';

const to12 = (t?: string) => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  if (isNaN(h)) return '';
  return `${String(h % 12 || 12).padStart(2, '0')}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

interface Props { attendance: Attendance[]; staff: Staff[]; date: string; }

/** Live IN/OUT feed — re-renders instantly whenever attendance state changes (kiosk patches, sync, poll). */
const LivePunchFeed: React.FC<Props> = ({ attendance, staff, date }) => {
  const events = useMemo(() => {
    const list: { id: string; name: string; role: string; kind: 'in' | 'out'; time: string }[] = [];
    attendance.filter(a => a.date === date).forEach(a => {
      const s = staff.find(x => x.id === a.staffId);
      const name = s?.name || a.staffName || 'Staff';
      const role = s?.designation || '';
      if (a.arrivalTime) list.push({ id: a.staffId + 'in', name, role, kind: 'in', time: a.arrivalTime });
      if (a.leavingTime) list.push({ id: a.staffId + 'out', name, role, kind: 'out', time: a.leavingTime });
    });
    return list.sort((x, y) => y.time.localeCompare(x.time)).slice(0, 12);
  }, [attendance, staff, date]);

  return (
    <div className="glass-card-static p-3 md:p-4 rounded-xl border border-[var(--glass-border)]">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-[var(--text-primary)]">
          <Activity className="w-4 h-4 text-emerald-500" />
          <h2 className="text-sm md:text-base font-bold">Live punches</h2>
          <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" /></span>
        </div>
        <span className="text-xs text-[var(--text-secondary)]">{events.length} recent</span>
      </div>
      {events.length === 0 ? (
        <p className="text-xs text-[var(--text-secondary)] py-2">No punches yet for this date.</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {events.map(e => (
            <div key={e.id} className="shrink-0 flex items-center gap-2 rounded-full border border-[var(--glass-border)] pl-1 pr-3 py-1">
              <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full text-white ${e.kind === 'in' ? 'bg-emerald-500' : 'bg-sky-500'}`}>{e.kind.toUpperCase()}</span>
              <span className="text-xs font-semibold text-[var(--text-primary)] max-w-[120px] truncate">{e.name}</span>
              {e.role && <span className="text-[10px] text-[var(--text-secondary)] hidden sm:inline">{e.role}</span>}
              <span className="text-[11px] font-medium text-[var(--text-secondary)]">{to12(e.time)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LivePunchFeed;

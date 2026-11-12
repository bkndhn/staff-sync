import React, { useMemo, useState } from 'react';
import { Clock, Search } from 'lucide-react';
import { Staff, Attendance } from '../../types';
import { workedMinutes, fmtHours } from '../../utils/workHours';

interface Props { staff: Staff[]; attendance: Attendance[]; date: string }

type Row = { id: string; name: string; location: string; inT?: string; outT?: string; mins: number | null; status: string };

const DailyHoursWidget: React.FC<Props> = ({ staff, attendance, date }) => {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'working' | 'done' | 'missing' | 'absent'>('all');
  const isToday = date === new Date().toLocaleDateString('en-CA');
  const now = new Date();
  const nowMin = isToday ? now.getHours() * 60 + now.getMinutes() : undefined;

  const rows: Row[] = useMemo(() => {
    const byStaff = new Map(attendance.filter(a => a.date === date && !a.isPartTime).map(a => [a.staffId, a]));
    return staff.filter(s => s.isActive && s.type !== 'part-time').map(s => {
      const a = byStaff.get(s.id);
      const inT = a?.arrivalTime, outT = a?.leavingTime;
      let mins = a?.totalHours ? Math.round(a.totalHours * 60) : workedMinutes(inT, outT, a?.breakTimeOut, a?.breakTimeIn, nowMin);
      if (!inT && !a?.totalHours) mins = null;
      const status = !a || a.status === 'Absent' ? (inT ? 'working' : 'absent')
        : inT && !outT ? (isToday ? 'working' : 'missing') : inT ? 'done' : a.status === 'Half Day' ? 'done' : 'absent';
      return { id: s.id, name: s.name, location: s.location, inT, outT, mins, status };
    }).sort((x, y) => (y.mins ?? -1) - (x.mins ?? -1));
  }, [staff, attendance, date, nowMin, isToday]);

  const shown = rows.filter(r => (filter === 'all' || r.status === filter) && (!q || r.name.toLowerCase().includes(q.toLowerCase())));
  const total = rows.reduce((s, r) => s + (r.mins ?? 0), 0);
  const worked = rows.filter(r => r.mins);
  const avg = worked.length ? total / worked.length : null;
  const count = (k: Row['status']) => rows.filter(r => r.status === k).length;
  const badge: Record<string, string> = {
    working: 'bg-blue-500/15 text-blue-400', done: 'bg-emerald-500/15 text-emerald-400',
    missing: 'bg-amber-500/15 text-amber-400', absent: 'bg-muted text-muted-foreground',
  };
  const label: Record<string, string> = { working: 'Working', done: 'Done', missing: 'No OUT', absent: 'Not in' };

  return (
    <section className="glass-card rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold"><Clock className="w-5 h-5 text-blue-500" /> Working hours today</h3>
        <div className="flex gap-3 text-xs text-muted-foreground">
          <span>Total <b className="text-foreground">{fmtHours(total)}</b></span>
          <span>Average <b className="text-foreground">{fmtHours(avg)}</b></span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['all', 'working', 'done', 'missing', 'absent'] as const).map(k => (
          <button key={k} onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${filter === k ? 'bg-blue-600 text-primary-foreground border-transparent' : 'border-border'}`}>
            {k === 'all' ? `All ${rows.length}` : `${label[k]} ${count(k)}`}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search staff"
            className="pl-7 pr-2 py-1.5 rounded-lg text-sm bg-background border border-border w-40" />
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto divide-y divide-border">
        {shown.map(r => (
          <div key={r.id} className="flex items-center gap-3 py-2 text-sm">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{r.name}</p>
              <p className="text-xs text-muted-foreground truncate">{r.location}</p>
            </div>
            <div className="text-xs tabular-nums text-right w-28">
              <p>IN {r.inT || '—'}</p><p>OUT {r.outT || '—'}</p>
            </div>
            <p className="w-20 text-right font-semibold tabular-nums">{fmtHours(r.mins)}</p>
            <span className={`w-16 text-center text-[11px] px-2 py-0.5 rounded-full ${badge[r.status]}`}>{label[r.status]}</span>
          </div>
        ))}
        {!shown.length && <p className="py-6 text-center text-sm text-muted-foreground">No staff to show.</p>}
      </div>
    </section>
  );
};
export default DailyHoursWidget;

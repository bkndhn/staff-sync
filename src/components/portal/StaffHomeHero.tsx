import React from 'react';
import { Clock, CalendarDays, FileText, BarChart3, Check, X, Minus, Sprout } from 'lucide-react';
import { Staff, Attendance } from '../../types';
import { localDateKey } from '../../lib/localDate';

type Section = 'attendance' | 'leave' | 'payslips' | 'tax';
interface Props { staff: Staff; attendance: Attendance[]; today: Date; onOpen: (s: Section) => void; }

const greet = (h: number) => (h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');

const StaffHomeHero: React.FC<Props> = ({ staff, attendance, today, onOpen }) => {
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const todayKey = localDateKey(today);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    const key = localDateKey(d);
    const rec = attendance.find((a) => a.date === key && a.staffId === staff.id && !a.isPartTime);
    const st = (rec?.status || '').toLowerCase();
    const state = key > todayKey ? 'future' : rec?.arrivalTime || st === 'present' || st === 'half day' ? 'ok' : st ? 'off' : 'none';
    return { d, key, state };
  });
  const actions: { id: Section; label: string; sub: string; Icon: any; tone: string }[] = [
    { id: 'attendance', label: 'Punch', sub: 'Check in/out', Icon: Clock, tone: 'zh-tone-green' },
    { id: 'leave', label: 'Leave', sub: 'Apply or view', Icon: CalendarDays, tone: 'zh-tone-pink' },
    { id: 'payslips', label: 'Payslip', sub: 'View payslip', Icon: FileText, tone: 'zh-tone-sky' },
    { id: 'tax', label: 'Tax', sub: 'View TDS', Icon: BarChart3, tone: 'zh-tone-violet' },
  ];
  return (
    <div className="space-y-4 animate-fade-in">
      <section className="zh-hero rounded-3xl p-6 sm:p-8 relative overflow-hidden">
        <p className="text-xs tracking-[0.2em] uppercase opacity-80">{greet(today.getHours())},</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold mt-1">{staff.name.split(' ')[0]} 👋</h1>
        <p className="mt-2 opacity-90">People make progress happen.</p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm zh-hero-chip">
          <Sprout size={16} /> A supportive workplace creates brighter tomorrows.
        </div>
        <div className="zh-hero-orb" aria-hidden />
      </section>

      <section>
        <h2 className="text-lg font-bold text-[var(--text-primary)] mb-3">Quick Actions</h2>
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {actions.map(({ id, label, sub, Icon, tone }) => (
            <button key={id} onClick={() => onOpen(id)} className={`zh-tile ${tone} rounded-2xl p-3 sm:p-4 flex flex-col items-center text-center transition-transform hover:-translate-y-0.5 active:scale-95`}>
              <Icon size={26} className="zh-tile-icon" />
              <span className="mt-2 font-semibold text-sm text-[var(--text-primary)]">{label}</span>
              <span className="text-[11px] text-[var(--text-muted)] hidden sm:block">{sub}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="bg-[var(--bg-card)] border border-[var(--glass-border)] rounded-3xl p-4 sm:p-5 shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">This week</h2>
          <button onClick={() => onOpen('attendance')} className="text-sm font-medium text-blue-500">View all ›</button>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map(({ d, key, state }) => (
            <div key={key} className={`rounded-2xl py-2 flex flex-col items-center gap-1 ${key === todayKey ? 'bg-blue-500/15' : ''}`}>
              <span className="text-[11px] text-[var(--text-muted)]">{d.toLocaleDateString('en-IN', { weekday: 'short' })}</span>
              <span className="text-sm font-semibold text-[var(--text-primary)]">{d.getDate()}</span>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center zh-day-${state}`}>
                {state === 'ok' ? <Check size={14} /> : state === 'off' ? <X size={14} /> : state === 'future' ? <Minus size={14} /> : null}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
export default StaffHomeHero;

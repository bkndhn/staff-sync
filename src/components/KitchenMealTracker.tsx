import React, { useEffect, useMemo, useState } from 'react';
import { UtensilsCrossed, Check, X, Package, HelpCircle, Home, Briefcase, Plane } from 'lucide-react';
import type { Staff, Attendance } from '../types';
import { mealService, type MealRow } from '../services/mealService';
import { MEALS, mealVerdict, mealCounts, type MealKind, type FoodChoice, type RoomStatus } from '../utils/mealHeadcount';

interface Props { staff: Staff[]; attendance: Attendance[]; date: string; recordedBy?: string }

const VERDICT_STYLE: Record<string, string> = {
  coming: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  not_coming: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  ask: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  unknown: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
};
const VERDICT_LABEL: Record<string, string> = { coming: 'Coming', not_coming: 'Not coming', ask: 'Absent – ask', unknown: 'Not marked' };

const KitchenMealTracker: React.FC<Props> = ({ staff, attendance, date, recordedBy }) => {
  const [meal, setMeal] = useState<MealKind>(() => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 17 ? 'lunch' : 'dinner'; });
  const [rows, setRows] = useState<MealRow[]>([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'coming' | 'not_coming' | 'ask' | 'unknown'>('all');

  useEffect(() => { mealService.forDay(date).then(setRows).catch(e => setError(e.message)); }, [date]);

  const active = useMemo(() => staff.filter(s => s.isActive), [staff]);
  const workOf = (id: string) => attendance.find(a => a.staffId === id && a.date === date)?.status;
  const entryOf = (id: string) => rows.find(r => r.staff_id === id && r.meal === meal);

  const list = active.map(s => ({ s, work: workOf(s.id), entry: entryOf(s.id), v: mealVerdict(workOf(s.id), entryOf(s.id)) }));
  const counts = mealCounts(list.map(l => l.v));
  const shown = filter === 'all' ? list : list.filter(l => l.v === filter);

  const save = async (s: Staff, patch: { in_room?: RoomStatus; food?: FoodChoice }) => {
    const cur = entryOf(s.id);
    const row: MealRow = { staff_id: s.id, staff_name: s.name, location: s.location, date, meal,
      in_room: patch.in_room ?? cur?.in_room ?? 'unknown', food: patch.food ?? cur?.food ?? 'unknown', recorded_by: recordedBy ?? null };
    setRows(prev => [...prev.filter(r => !(r.staff_id === s.id && r.meal === meal)), row]);
    try { await mealService.save([row]); setError(''); } catch (e: any) { setError(e.message); }
  };

  const btn = (on: boolean) => `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border transition ${on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'}`;

  return (
    <div className="space-y-4">
      <div className="zh-hero rounded-2xl p-5 text-white">
        <div className="flex items-center gap-2 text-sm opacity-90"><UtensilsCrossed className="h-4 w-4" /> Kitchen headcount · {date}</div>
        <h1 className="mt-1 text-2xl font-bold">Who is eating today?</h1>
        <div className="mt-4 flex gap-2">
          {MEALS.map(m => (
            <button key={m.id} onClick={() => setMeal(m.id)}
              className={`flex-1 rounded-xl px-3 py-2 text-left ${meal === m.id ? 'bg-white text-slate-900' : 'bg-white/15 text-white'}`}>
              <div className="text-sm font-semibold">{m.label}</div><div className="text-[11px] opacity-80">{m.time}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['coming', 'ask', 'not_coming', 'unknown'] as const).map(k => (
          <button key={k} onClick={() => setFilter(filter === k ? 'all' : k)}
            className={`rounded-2xl p-4 text-left ${VERDICT_STYLE[k]} ${filter === k ? 'ring-2 ring-blue-500' : ''}`}>
            <div className="text-3xl font-bold">{counts[k]}</div><div className="text-xs font-medium">{VERDICT_LABEL[k]}</div>
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-300">Present at work counts as coming unless you mark otherwise. Absent staff need a quick check: are they in the room and eating?</p>
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">{error}</div>}

      <div className="space-y-2">
        {shown.map(({ s, work, entry, v }) => (
          <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">{s.name}</div>
                <div className="text-xs text-slate-600 dark:text-slate-300">{s.location} · Work: {work || 'Not marked'}</div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${VERDICT_STYLE[v]}`}>{VERDICT_LABEL[v]}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button className={btn(entry?.in_room === 'in_room')} onClick={() => save(s, { in_room: 'in_room' })}><Home className="h-3 w-3" />In room</button>
              <button className={btn(entry?.in_room === 'at_work')} onClick={() => save(s, { in_room: 'at_work' })}><Briefcase className="h-3 w-3" />At work</button>
              <button className={btn(entry?.in_room === 'away')} onClick={() => save(s, { in_room: 'away' })}><Plane className="h-3 w-3" />Away</button>
              <span className="mx-1 w-px bg-slate-200 dark:bg-slate-700" />
              <button className={btn(entry?.food === 'eating')} onClick={() => save(s, { food: 'eating' })}><Check className="h-3 w-3" />Eating</button>
              <button className={btn(entry?.food === 'parcel')} onClick={() => save(s, { food: 'parcel' })}><Package className="h-3 w-3" />Parcel</button>
              <button className={btn(entry?.food === 'skip')} onClick={() => save(s, { food: 'skip' })}><X className="h-3 w-3" />Skip</button>
              <button className={btn(!entry || entry.food === 'unknown')} onClick={() => save(s, { food: 'unknown' })}><HelpCircle className="h-3 w-3" />Not sure</button>
            </div>
          </div>
        ))}
        {!shown.length && <div className="p-6 text-center text-sm text-slate-600 dark:text-slate-300">No staff here.</div>}
      </div>
    </div>
  );
};
export default KitchenMealTracker;

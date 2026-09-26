import React, { useMemo, useState } from 'react';
import { Users, Star, Printer, ChevronDown, ChevronUp } from 'lucide-react';
import type { Attendance } from '../types';

interface Props {
  attendance: Attendance[];
  userLocation?: string;
}

type Range = 30 | 90 | 180;

interface Worker {
  key: string;
  name: string;
  location: string;
  phone?: string;
  shifts: number;
  absences: number;
  earnings: number;
  lastDate: string;
  hours: number;
  overtime: number;
  last: Attendance;
}

const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const FlexPoolHub: React.FC<Props> = ({ attendance, userLocation }) => {
  const [open, setOpen] = useState(true);
  const [range, setRange] = useState<Range>(30);

  const workers = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - range);
    const sinceStr = since.toISOString().slice(0, 10);
    const map = new Map<string, Worker>();
    for (const a of attendance) {
      if (!a.isPartTime || !a.staffName || a.date < sinceStr) continue;
      if (userLocation && a.location && a.location !== userLocation) continue;
      const key = `${a.staffName.trim().toLowerCase()}|${a.location || ''}`;
      const w = map.get(key) || {
        key, name: a.staffName.trim(), location: a.location || '—', phone: a.phone,
        shifts: 0, absences: 0, earnings: 0, lastDate: '', hours: 0, overtime: 0, last: a,
      };
      if (a.status === 'Absent') w.absences += 1;
      else {
        w.shifts += a.attendanceValue || 1;
        w.earnings += a.salary || 0;
        w.hours += a.totalHours || 0;
        w.overtime += a.overtimeHours || 0;
      }
      if (a.date >= w.lastDate) { w.lastDate = a.date; w.last = a; if (a.phone) w.phone = a.phone; }
      map.set(key, w);
    }
    return [...map.values()]
      .map(w => ({ ...w, reliability: w.shifts + w.absences > 0 ? w.shifts / (w.shifts + w.absences) : 0 }))
      .sort((a, b) => b.reliability - a.reliability || b.shifts - a.shifts);
  }, [attendance, range, userLocation]);

  const printVoucher = (w: Worker) => {
    const a = w.last;
    const win = window.open('', '_blank', 'width=420,height=600');
    if (!win) return;
    win.document.write(`<html><head><title>Shift voucher</title>
      <style>body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a}h2{margin:0 0 4px}
      table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:6px 0;border-bottom:1px solid #e2e8f0}
      td:last-child{text-align:right;font-weight:600}.tot td{font-size:18px;border:none;padding-top:12px}
      .sig{margin-top:48px;display:flex;justify-content:space-between;font-size:12px;color:#64748b}</style></head><body>
      <h2>Shift Payout Voucher</h2><div style="font-size:12px;color:#64748b">Issued ${esc(new Date().toLocaleString('en-IN'))}</div>
      <table>
        <tr><td>Worker</td><td>${esc(w.name)}</td></tr>
        <tr><td>Branch</td><td>${esc(w.location)}</td></tr>
        <tr><td>Shift date</td><td>${esc(new Date(a.date).toLocaleDateString('en-IN'))}</td></tr>
        <tr><td>Shift</td><td>${esc(a.shift || '—')}</td></tr>
        <tr><td>In / Out</td><td>${esc(a.arrivalTime || '—')} / ${esc(a.leavingTime || '—')}</td></tr>
        <tr><td>Status</td><td>${esc(a.status)}</td></tr>
        <tr class="tot"><td>Amount payable</td><td>${esc(inr(a.status === 'Absent' ? 0 : a.salary || 0))}</td></tr>
      </table>
      <div class="sig"><span>Worker signature</span><span>Supervisor signature</span></div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl mb-4">
      <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3">
        <span className="flex items-center gap-2 font-semibold text-gray-800">
          <Users size={18} className="text-blue-600" /> Flex Pool Hub
          <span className="text-xs font-normal text-gray-500">({workers.length} workers)</span>
        </span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && (
        <div className="border-t border-gray-100">
          <div className="flex gap-2 px-4 py-3">
            {([30, 90, 180] as Range[]).map(r => (
              <button key={r} type="button" onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${range === r ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {r === 30 ? 'Last 30 days' : r === 90 ? '3 months' : '6 months'}
              </button>
            ))}
          </div>
          {workers.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-gray-500">No flex shifts in this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2">Worker</th>
                    <th className="text-left px-2 py-2">Branch</th>
                    <th className="text-right px-2 py-2">Shifts</th>
                    <th className="text-right px-2 py-2">Reliability</th>
                    <th className="text-right px-2 py-2">Earned</th>
                    <th className="text-right px-2 py-2">Last shift</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {workers.map((w, i) => (
                    <tr key={w.key}>
                      <td className="px-4 py-2 font-medium text-gray-800">
                        <span className="flex items-center gap-1">
                          {i < 3 && w.reliability >= 0.9 && <Star size={14} className="text-amber-500 fill-amber-400" />}
                          {w.name}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-gray-600">{w.location}</td>
                      <td className="px-2 py-2 text-right">{w.shifts}</td>
                      <td className={`px-2 py-2 text-right font-semibold ${w.reliability >= 0.9 ? 'text-emerald-600' : w.reliability >= 0.7 ? 'text-amber-600' : 'text-red-600'}`}>
                        {Math.round(w.reliability * 100)}%
                      </td>
                      <td className="px-2 py-2 text-right">{inr(w.earnings)}</td>
                      <td className="px-2 py-2 text-right text-gray-600">{new Date(w.lastDate).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-2 text-right">
                        <button type="button" onClick={() => printVoucher(w)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100">
                          <Printer size={13} /> Voucher
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FlexPoolHub;

import React, { useEffect, useMemo, useState } from 'react';
import { Coffee, Plus, Trash2, Edit3, AlertTriangle, Users, Clock, RefreshCw, Filter, Download } from 'lucide-react';
import { Staff, User, BreakType, BreakEvent, BreakPolicy } from '../types';
import { breakTypeService, breakEventService, breakPolicyService } from '../services/breakService';
import { customAlert, customConfirm } from './CustomDialog';

interface Props {
  staff: Staff[];
  user: User;
}

const toCsv = (rows: any[]) => {
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  return [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n');
};

const BreakManagement: React.FC<Props> = ({ staff, user }) => {
  const [tab, setTab] = useState<'events' | 'types' | 'policies'>('events');
  const [types, setTypes] = useState<BreakType[]>([]);
  const [events, setEvents] = useState<BreakEvent[]>([]);
  const [policies, setPolicies] = useState<BreakPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>(user.role === 'manager' ? user.location || 'all' : 'all');
  const [floorFilter, setFloorFilter] = useState<string>(user.role === 'supervisor' || user.role === 'floor_supervisor' ? user.floor || 'all' : 'all');
  const [showFilters, setShowFilters] = useState(false);

  // Edit modal
  const [editing, setEditing] = useState<Partial<BreakEvent> | null>(null);
  // Type form
  const [typeForm, setTypeForm] = useState<Partial<BreakType> | null>(null);
  // Policy form
  const [policyForm, setPolicyForm] = useState<Partial<BreakPolicy> | null>(null);

  const refresh = async () => {
    setLoading(true);
    const [t, p] = await Promise.all([breakTypeService.list(), breakPolicyService.list()]);
    setTypes(t);
    setPolicies(p);
    const ev = await breakEventService.list({
      startDate, endDate,
      staffId: staffFilter !== 'all' ? staffFilter : undefined,
      location: locationFilter !== 'all' ? locationFilter : undefined,
    });
    setEvents(ev);
    setLoading(false);
  };

  useEffect(() => { refresh();   }, [startDate, endDate, staffFilter, locationFilter]);

  const filteredStaff = useMemo(
    () => staff.filter(s => {
      if (locationFilter !== 'all' && s.location !== locationFilter) return false;
      if (floorFilter !== 'all' && s.floor !== floorFilter) return false;
      return true;
    }),
    [staff, locationFilter, floorFilter]
  );

  const locations = useMemo(
    () => Array.from(new Set(staff.map(s => s.location).filter(Boolean))),
    [staff]
  );

  const floors = useMemo(
    () => Array.from(new Set(staff.map(s => s.floor).filter(Boolean))),
    [staff]
  );

  const filteredEvents = useMemo(() => {
    if (floorFilter === 'all') return events;
    const floorStaffIds = new Set(staff.filter(s => s.floor === floorFilter).map(s => s.id));
    return events.filter(e => floorStaffIds.has(e.staffId));
  }, [events, staff, floorFilter]);

  const summary = useMemo(() => breakEventService.summarize(filteredEvents), [filteredEvents]);

  const exportCsv = () => {
    const rows = filteredEvents.map(e => ({
      Date: e.date,
      Staff: e.staffName,
      Branch: e.location,
      Type: e.breakTypeCode,
      Start: e.startTime,
      End: e.endTime || '',
      Duration_min: e.durationMinutes || '',
      Source: e.source,
      Violation: e.isViolation ? 'YES' : '',
      Reason: e.violationReason || '',
      Notes: e.notes || '',
    }));
    const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `breaks-${startDate}-to-${endDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const deleteEvent = async (id: string) => {
    if (!(await customConfirm('Delete this break record?'))) return;
    await breakEventService.remove(id, user.email);
    refresh();
  };

  const saveEvent = async () => {
    if (!editing || !editing.staffId || !editing.date || !editing.startTime) {
      await customAlert('Staff, Date, and Start time are required');
      return;
    }
    const type = types.find(t => t.id === editing.breakTypeId);
    await breakEventService.upsertManual({
      ...editing,
      staffId: editing.staffId,
      date: editing.date,
      startTime: editing.startTime,
      breakTypeCode: type?.code || editing.breakTypeCode,
      staffName: editing.staffName || staff.find(s => s.id === editing.staffId)?.name,
      location: editing.location || staff.find(s => s.id === editing.staffId)?.location,
      source: 'manual',
      createdBy: user.email,
    });
    setEditing(null);
    refresh();
  };

  const saveType = async () => {
    if (!typeForm?.name || !typeForm?.code) { await customAlert('Name and Code required'); return; }
    await breakTypeService.upsert({
      ...typeForm,
      name: typeForm.name!,
      code: typeForm.code!.toLowerCase().replace(/\s+/g, '_'),
    });
    setTypeForm(null);
    refresh();
  };

  const savePolicy = async () => {
    if (!policyForm) return;
    await breakPolicyService.upsert(policyForm);
    setPolicyForm(null);
    refresh();
  };

  // ─── RENDER ───
  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center"><Coffee className="text-amber-500" /></div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Break Management</h1>
            <p className="text-xs text-[var(--text-muted)]">Track breaks, enforce policies, audit & report</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} className="btn-ghost flex items-center gap-1"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</button>
          {tab === 'events' && <button onClick={exportCsv} className="btn-ghost flex items-center gap-1"><Download size={14} /> CSV</button>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-[var(--glass-border)]">
        {(['events', 'types', 'policies'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold capitalize ${tab === t ? 'border-b-2 border-amber-500 text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'events' && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={Users} label="On Break Now" value={String(summary.onBreak)} color="amber" />
            <StatCard icon={Coffee} label="Total Breaks" value={String(summary.count)} color="blue" />
            <StatCard icon={Clock} label="Total Minutes" value={String(summary.totalMinutes)} color="indigo" />
            <StatCard icon={AlertTriangle} label="Violations" value={String(summary.violations)} color="red" />
          </div>

          {/* Filters */}
          <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                <Filter size={14} className="text-indigo-400" />
                <span>Filter Options</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className="sm:hidden flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-xs font-medium text-[var(--text-primary)]"
                >
                  <span>{showFilters ? 'Hide Filters' : 'Show Filters'}</span>
                </button>
                <button onClick={() => setEditing({ date: today, source: 'manual' })} className="btn-premium py-1.5 px-3 text-xs flex items-center gap-1">
                  <Plus size={14} /> Add Manual Break
                </button>
              </div>
            </div>

            <div className={`${showFilters ? 'flex' : 'hidden sm:flex'} flex-wrap items-end gap-3 pt-2 sm:pt-0 border-t sm:border-0 border-[var(--glass-border)]`}>
              <Field label="From"><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-premium" /></Field>
              <Field label="To"><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-premium" /></Field>
              <Field label="Staff">
                <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)} className="input-premium">
                  <option value="all">All</option>
                  {filteredStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              {user.role === 'admin' && (
                <Field label='Branch'>
                  <select value={locationFilter} onChange={e => setLocationFilter(e.target.value)} className="input-premium">
                    <option value="all">All Branchs</option>
                    {locations.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </Field>
              )}
              <Field label='Zone'>
                <select value={floorFilter} onChange={e => setFloorFilter(e.target.value)} className="input-premium">
                  <option value="all">All Zones</option>
                  {floors.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-2xl border border-[var(--glass-border)]">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-xs uppercase text-[var(--text-muted)]">
                <tr>
                  <th className="p-3">Date</th><th className="p-3">Staff</th><th className="p-3">Type</th>
                  <th className="p-3">Start</th><th className="p-3">End</th><th className="p-3">Duration</th>
                  <th className="p-3">Source</th><th className="p-3">Flags</th><th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.map(e => (
                  <tr key={e.id} className="border-t border-[var(--glass-border)] hover:bg-white/5">
                    <td className="p-3">{e.date}</td>
                    <td className="p-3">
                      <div className="font-semibold">{e.staffName || '—'}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{e.location}</div>
                    </td>
                    <td className="p-3 capitalize">{e.breakTypeCode || '—'}</td>
                    <td className="p-3 font-mono text-xs">{e.startTime.slice(0, 5)}</td>
                    <td className="p-3 font-mono text-xs">{e.endTime ? e.endTime.slice(0, 5) : <span className="text-amber-500">ongoing</span>}</td>
                    <td className="p-3 font-mono">{e.durationMinutes != null ? `${e.durationMinutes}m` : '—'}</td>
                    <td className="p-3 text-xs">{e.source}</td>
                    <td className="p-3">{e.isViolation && <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-500">violation</span>}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setEditing(e)} className="p-1.5 rounded-lg hover:bg-white/10"><Edit3 size={14} /></button>
                        <button onClick={() => deleteEvent(e.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredEvents.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-[var(--text-muted)]">No break records for selected filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'types' && (
        <div className="space-y-3">
          <button onClick={() => setTypeForm({ name: '', code: '', defaultMinutes: 15, maxMinutes: 30, isPaid: true, isActive: true })}
            className="btn-premium flex items-center gap-1"><Plus size={14} /> Add Break Type</button>
          <div className="grid md:grid-cols-2 gap-3">
            {types.map(t => (
              <div key={t.id} className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold">{t.name} <span className="text-[10px] text-[var(--text-muted)]">({t.code})</span></div>
                  <div className="text-xs text-[var(--text-muted)]">Default {t.defaultMinutes}m · Max {t.maxMinutes}m · {t.isPaid ? 'Paid' : 'Unpaid'} · {t.isActive ? 'Active' : 'Inactive'}</div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setTypeForm(t)} className="p-1.5 rounded-lg hover:bg-white/10"><Edit3 size={14} /></button>
                  <button onClick={async () => { if (await customConfirm('Delete type?')) { await breakTypeService.remove(t.id); refresh(); } }} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'policies' && (
        <div className="space-y-3">
          <button onClick={() => setPolicyForm({ maxPerDay: 1, maxMinutesPerBreak: 30, maxTotalMinutesPerDay: 60, deductFromHours: false, graceMinutes: 5 })}
            className="btn-premium flex items-center gap-1"><Plus size={14} /> Add Policy</button>
          <div className="overflow-x-auto rounded-2xl border border-[var(--glass-border)]">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-left text-xs uppercase text-[var(--text-muted)]">
                <tr><th className="p-3">Branch</th><th className="p-3">Type</th><th className="p-3">Max/day</th><th className="p-3">Max min/break</th><th className="p-3">Max total/day</th><th className="p-3">Deduct</th><th className="p-3"></th></tr>
              </thead>
              <tbody>
                {policies.map(p => {
                  const t = types.find(tp => tp.id === p.breakTypeId);
                  return (
                    <tr key={p.id} className="border-t border-[var(--glass-border)]">
                      <td className="p-3">{p.location || 'All'}</td>
                      <td className="p-3">{t?.name || 'All'}</td>
                      <td className="p-3">{p.maxPerDay}</td>
                      <td className="p-3">{p.maxMinutesPerBreak}m</td>
                      <td className="p-3">{p.maxTotalMinutesPerDay}m</td>
                      <td className="p-3">{p.deductFromHours ? 'Yes' : 'No'}</td>
                      <td className="p-3 text-right">
                        <button onClick={() => setPolicyForm(p)} className="p-1.5 rounded-lg hover:bg-white/10"><Edit3 size={14} /></button>
                        <button onClick={async () => { if (await customConfirm('Delete policy?')) { await breakPolicyService.remove(p.id); refresh(); } }} className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-500"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
                {policies.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-[var(--text-muted)]">No policies set. Defaults from break type limits will apply.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Event editor modal */}
      {editing && (
        <Modal title={editing.id ? 'Edit Break' : 'Add Break Record'} onClose={() => setEditing(null)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Staff">
              <select value={editing.staffId || ''} onChange={e => setEditing({ ...editing, staffId: e.target.value })} className="input-premium">
                <option value="">Select</option>
                {filteredStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Break Type">
              <select value={editing.breakTypeId || ''} onChange={e => setEditing({ ...editing, breakTypeId: e.target.value })} className="input-premium">
                <option value="">—</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Date"><input type="date" value={editing.date || ''} onChange={e => setEditing({ ...editing, date: e.target.value })} className="input-premium" /></Field>
            <Field label="Start Time"><input type="time" value={(editing.startTime || '').slice(0, 5)} onChange={e => setEditing({ ...editing, startTime: e.target.value + ':00' })} className="input-premium" /></Field>
            <Field label="End Time (optional)"><input type="time" value={(editing.endTime || '').slice(0, 5)} onChange={e => setEditing({ ...editing, endTime: e.target.value ? e.target.value + ':00' : null })} className="input-premium" /></Field>
            <Field label="Notes"><input value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} className="input-premium" /></Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setEditing(null)} className="btn-ghost">Cancel</button>
            <button onClick={saveEvent} className="btn-premium">Save</button>
          </div>
        </Modal>
      )}

      {/* Type editor */}
      {typeForm && (
        <Modal title={typeForm.id ? 'Edit Break Type' : 'New Break Type'} onClose={() => setTypeForm(null)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name"><input value={typeForm.name || ''} onChange={e => setTypeForm({ ...typeForm, name: e.target.value })} className="input-premium" /></Field>
            <Field label="Code"><input value={typeForm.code || ''} onChange={e => setTypeForm({ ...typeForm, code: e.target.value })} className="input-premium" placeholder="lunch / tea / custom" /></Field>
            <Field label="Default Minutes"><input type="number" value={typeForm.defaultMinutes ?? 15} onChange={e => setTypeForm({ ...typeForm, defaultMinutes: Number(e.target.value) })} className="input-premium" /></Field>
            <Field label="Max Minutes"><input type="number" value={typeForm.maxMinutes ?? 30} onChange={e => setTypeForm({ ...typeForm, maxMinutes: Number(e.target.value) })} className="input-premium" /></Field>
            <Field label="Paid"><input type="checkbox" checked={!!typeForm.isPaid} onChange={e => setTypeForm({ ...typeForm, isPaid: e.target.checked })} /></Field>
            <Field label="Active"><input type="checkbox" checked={typeForm.isActive !== false} onChange={e => setTypeForm({ ...typeForm, isActive: e.target.checked })} /></Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setTypeForm(null)} className="btn-ghost">Cancel</button>
            <button onClick={saveType} className="btn-premium">Save</button>
          </div>
        </Modal>
      )}

      {/* Policy editor */}
      {policyForm && (
        <Modal title={policyForm.id ? 'Edit Policy' : 'New Policy'} onClose={() => setPolicyForm(null)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Branch (blank = all)">
              <select value={policyForm.location || ''} onChange={e => setPolicyForm({ ...policyForm, location: e.target.value || undefined })} className="input-premium">
                <option value="">All</option>
                {locations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </Field>
            <Field label="Break Type (blank = all)">
              <select value={policyForm.breakTypeId || ''} onChange={e => setPolicyForm({ ...policyForm, breakTypeId: e.target.value || undefined })} className="input-premium">
                <option value="">All</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Max per day"><input type="number" value={policyForm.maxPerDay ?? 1} onChange={e => setPolicyForm({ ...policyForm, maxPerDay: Number(e.target.value) })} className="input-premium" /></Field>
            <Field label="Max min / break"><input type="number" value={policyForm.maxMinutesPerBreak ?? 30} onChange={e => setPolicyForm({ ...policyForm, maxMinutesPerBreak: Number(e.target.value) })} className="input-premium" /></Field>
            <Field label="Max total min / day"><input type="number" value={policyForm.maxTotalMinutesPerDay ?? 60} onChange={e => setPolicyForm({ ...policyForm, maxTotalMinutesPerDay: Number(e.target.value) })} className="input-premium" /></Field>
            <Field label="Grace minutes"><input type="number" value={policyForm.graceMinutes ?? 5} onChange={e => setPolicyForm({ ...policyForm, graceMinutes: Number(e.target.value) })} className="input-premium" /></Field>
            <Field label="Deduct from working hours"><input type="checkbox" checked={!!policyForm.deductFromHours} onChange={e => setPolicyForm({ ...policyForm, deductFromHours: e.target.checked })} /></Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setPolicyForm(null)} className="btn-ghost">Cancel</button>
            <button onClick={savePolicy} className="btn-premium">Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
    <span className="font-semibold uppercase tracking-wide">{label}</span>
    {children}
  </label>
);

const colorMap: Record<string, string> = {
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
  blue: 'border-blue-500/30 bg-blue-500/10 text-blue-500',
  indigo: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-500',
  red: 'border-red-500/30 bg-red-500/10 text-red-500',
};
const StatCard: React.FC<{ icon: React.ElementType; label: string; value: string; color: string }> = ({ icon: Icon, label, value, color }) => (
  <div className={`rounded-2xl border p-4 ${colorMap[color]}`}>
    <Icon size={18} className="mb-1.5 opacity-80" />
    <div className="text-2xl font-bold">{value}</div>
    <div className="text-[11px] uppercase opacity-80 mt-0.5">{label}</div>
  </div>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="modal-overlay">
    <div className="modal-content max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold">{title}</h3>
        <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
      </div>
      {children}
    </div>
  </div>
);

export default BreakManagement;

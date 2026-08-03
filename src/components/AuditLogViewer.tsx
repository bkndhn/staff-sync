import React, { useState, useEffect } from 'react';
import { AuditLog } from '../types';
import { auditLogService } from '../services/auditLogService';
import { Search, ShieldAlert, Clock, RefreshCw, Trash2, Filter, ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import { customConfirm } from './CustomDialog';

const formatValue = (v: any): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  return String(v);
};

const humanizeField = (key: string): string =>
  key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, c => c.toUpperCase());

export const AuditLogViewer: React.FC<{ currentUserEmail: string }> = ({ currentUserEmail }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const data = await auditLogService.getLogs();
      setLogs(data);
    } catch (err) {
      console.error('Failed to load audit logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const handleClear = async () => {
    if (await customConfirm('Clear local audit trail history? Remote logs are unaffected.')) {
      await auditLogService.clearLogs();
      setLogs([]);
    }
  };

  const filteredLogs = logs.filter(log => {
    const matchesSearch =
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.performedBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.staffName && log.staffName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesAction = selectedAction === 'all' || log.action === selectedAction;
    return matchesSearch && matchesAction;
  });

  const getActionBadge = (action: AuditLog['action']) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      attendance_override: { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400', label: 'Attendance Override' },
      salary_edit: { bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400', label: 'Salary Edit' },
      staff_update: { bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-400', label: 'Staff Update' },
      staff_create: { bg: 'bg-teal-500/10 border-teal-500/20', text: 'text-teal-400', label: 'Staff Created' },
      staff_delete: { bg: 'bg-rose-500/10 border-rose-500/20', text: 'text-rose-400', label: 'Staff Removed' },
      bulk_update: { bg: 'bg-purple-500/10 border-purple-500/20', text: 'text-purple-400', label: 'Bulk Action' },
      settings_update: { bg: 'bg-indigo-500/10 border-indigo-500/20', text: 'text-indigo-400', label: 'Settings Update' },
    };
    const cfg = map[action] || { bg: 'bg-gray-500/10 border-gray-500/20', text: 'text-gray-400', label: action };
    return <span className={`px-2.5 py-1 rounded-md text-xs font-semibold ${cfg.bg} ${cfg.text} border`}>{cfg.label}</span>;
  };

  const formatDate = (isoStr: string) => {
    try {
      return new Date(isoStr).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
      });
    } catch { return isoStr; }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-24">
      <div className="card-premium p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
            <ShieldAlert className="text-purple-400" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-200 flex items-center gap-2 flex-wrap">
              System Audit Trail
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                {filteredLogs.length} Records
              </span>
            </h2>
            <p className="text-slate-400 text-xs sm:text-sm">Before/after diffs for staff, attendance, salary, and settings changes.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
          <button onClick={fetchLogs} disabled={loading} className="btn-premium px-3 py-2 text-xs flex items-center gap-1.5">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button onClick={handleClear} className="btn-premium btn-premium-danger px-3 py-2 text-xs flex items-center gap-1.5">
            <Trash2 size={14} />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2 relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 z-10" size={18} />
          <input
            type="text"
            placeholder="Search by staff name, details, or user…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '2.75rem' }}
            className="input-premium text-sm py-2.5 w-full"
          />
        </div>
        <div className="relative">
          <Filter className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 z-10" size={18} />
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            style={{ paddingLeft: '2.75rem', paddingRight: '2rem' }}
            className="input-premium text-sm py-2.5 w-full appearance-none cursor-pointer"
          >
            <option value="all">All Event Types</option>
            <option value="attendance_override">Attendance Override</option>
            <option value="salary_edit">Salary Edit</option>
            <option value="staff_update">Staff Update</option>
            <option value="staff_create">Staff Created</option>
            <option value="staff_delete">Staff Removed</option>
            <option value="bulk_update">Bulk Action</option>
            <option value="settings_update">Settings Update</option>
          </select>
        </div>
      </div>


      <div className="card-premium overflow-hidden border border-slate-700">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="mx-auto animate-spin text-purple-400" size={28} />
            <p className="text-sm text-slate-400">Loading audit trail…</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <ShieldAlert className="mx-auto text-slate-600" size={40} />
            <p className="text-sm font-semibold text-slate-400">No audit logs found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">Changes to staff, attendance, salary, and settings will appear here with before/after values.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700">
            {filteredLogs.map((log) => {
              const hasDiff = (log.changes && log.changes.length > 0);
              const isOpen = !!expanded[log.id];
              return (
                <div key={log.id} className="p-4 sm:p-5 hover:bg-slate-800 transition-colors">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="space-y-1.5 flex-1 pr-4 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getActionBadge(log.action)}
                        {log.staffName && (
                          <span className="text-xs font-semibold text-slate-200">
                            Target: <span className="text-blue-400">{log.staffName}</span>
                          </span>
                        )}
                        {hasDiff && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/25 font-mono">
                            {log.changes!.length} field{log.changes!.length > 1 ? 's' : ''} changed
                          </span>
                        )}
                      </div>
                      <p className="text-xs sm:text-sm font-medium text-slate-300 leading-relaxed break-words">
                        {log.details}
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1 font-mono">
                        <span>By: <span className="text-slate-400 font-semibold">{log.performedBy}</span></span>
                        {log.performedBy === currentUserEmail && (
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-700 text-slate-400">You</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center whitespace-nowrap">
                      {hasDiff && (
                        <button
                          onClick={() => setExpanded(e => ({ ...e, [log.id]: !e[log.id] }))}
                          className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-md text-purple-300 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/25"
                        >
                          {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          {isOpen ? 'Hide diff' : 'View diff'}
                        </button>
                      )}
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono bg-slate-800/50 px-2.5 py-1.5 rounded-lg border border-slate-700">
                        <Clock size={12} className="text-purple-400/70 flex-shrink-0" />
                        <span>{formatDate(log.timestamp)}</span>
                      </div>
                    </div>
                  </div>

                  {isOpen && hasDiff && (
                    <div className="mt-3 rounded-lg border border-slate-700 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-800/50 text-slate-400 uppercase tracking-wider text-[10px]">
                          <tr>
                            <th className="text-left p-2">Field</th>
                            <th className="text-left p-2 text-rose-300/80">Before</th>
                            <th className="text-left p-2 w-8"></th>
                            <th className="text-left p-2 text-emerald-300/80">After</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700">
                          {log.changes!.map((c, i) => (
                            <tr key={i}>
                              <td className="p-2 font-semibold text-slate-300">{c.label ? humanizeField(c.label) : humanizeField(c.field)}</td>
                              <td className="p-2 font-mono text-rose-300/80 line-through decoration-rose-400/30">{formatValue(c.oldValue)}</td>
                              <td className="p-2 text-slate-600"><ArrowRight size={12} /></td>
                              <td className="p-2 font-mono text-emerald-300">{formatValue(c.newValue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

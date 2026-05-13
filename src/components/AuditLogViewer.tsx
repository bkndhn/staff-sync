import React, { useState, useEffect } from 'react';
import { AuditLog } from '../types';
import { auditLogService } from '../services/auditLogService';
import { Search, ShieldAlert, Clock, RefreshCw, Trash2, Filter } from 'lucide-react';

export const AuditLogViewer: React.FC<{ currentUserEmail: string }> = ({ currentUserEmail }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('all');

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

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleClear = async () => {
    if (window.confirm('Are you sure you want to clear local audit trail history?')) {
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
    switch (action) {
      case 'attendance_override':
        return <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">Attendance Override</span>;
      case 'salary_edit':
        return <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">Salary Edit</span>;
      case 'staff_update':
        return <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Staff Update</span>;
      case 'bulk_update':
        return <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">Bulk Action</span>;
      default:
        return <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/20">{action}</span>;
    }
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('en-IN', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-24">
      {/* Header Card */}
      <div className="card-premium p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
            <ShieldAlert className="text-purple-400" size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              System Audit Trail
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                {filteredLogs.length} Records
              </span>
            </h2>
            <p className="text-white/50 text-xs sm:text-sm">Secure record of manual modifications, attendance overrides, and compliance state adjustments</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
          <button 
            onClick={fetchLogs} 
            disabled={loading}
            className="btn-premium px-3 py-2 text-xs flex items-center gap-1.5"
            title="Refresh Logs"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button 
            onClick={handleClear}
            className="btn-premium btn-premium-danger px-3 py-2 text-xs flex items-center gap-1.5"
            title="Clear Audit Trail"
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>
      </div>

      {/* Filter and Search controls */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2 relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" size={18} />
          <input
            type="text"
            placeholder="Search logs by staff name, details, or user..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-premium pl-10 text-sm py-2.5 w-full placeholder:text-white/30 font-medium"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" size={18} />
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="input-premium pl-10 text-sm py-2.5 w-full appearance-none pr-8 cursor-pointer font-medium"
          >
            <option value="all" className="bg-[#131324] text-white">All Event Types</option>
            <option value="attendance_override" className="bg-[#131324] text-white">Attendance Override</option>
            <option value="salary_edit" className="bg-[#131324] text-white">Salary Edit</option>
            <option value="staff_update" className="bg-[#131324] text-white">Staff Update</option>
            <option value="bulk_update" className="bg-[#131324] text-white">Bulk Action</option>
          </select>
        </div>
      </div>

      {/* Logs View */}
      <div className="card-premium overflow-hidden border border-white/5">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <RefreshCw className="mx-auto animate-spin text-purple-400" size={28} />
            <p className="text-sm text-white/50">Loading secure logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <ShieldAlert className="mx-auto text-white/20" size={40} />
            <p className="text-sm font-semibold text-white/60">No Audit Logs Found</p>
            <p className="text-xs text-white/40 max-w-sm mx-auto">No matching system activity records exist for the specified filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filteredLogs.map((log) => (
              <div key={log.id} className="p-4 sm:p-5 hover:bg-white/[0.02] transition-colors flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="space-y-1.5 flex-1 pr-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    {getActionBadge(log.action)}
                    {log.staffName && (
                      <span className="text-xs font-semibold text-white/90">
                        Target: <span className="text-blue-400">{log.staffName}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm font-medium text-white/80 tracking-wide leading-relaxed">
                    {log.details}
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-white/40 pt-1 font-mono">
                    <span>By: <span className="text-white/60 font-semibold">{log.performedBy}</span></span>
                    {log.performedBy === currentUserEmail && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-white/5 text-white/40">You</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-white/40 self-end sm:self-center font-mono whitespace-nowrap bg-white/[0.02] px-2.5 py-1.5 rounded-lg border border-white/5">
                  <Clock size={12} className="text-purple-400/70 flex-shrink-0" />
                  <span>{formatDate(log.timestamp)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

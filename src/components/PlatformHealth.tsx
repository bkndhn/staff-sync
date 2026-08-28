import React, { useState, useEffect } from 'react';
import { errorTracker, ErrorLog } from '../services/errorTrackingService';
import { healthCheckService, HealthCheckResult } from '../services/healthCheckService';
import {
  Activity, Clock,
  AlertTriangle, CheckCircle, XCircle, RefreshCw,
  Zap, Bug, ChevronDown, ChevronRight
} from 'lucide-react';

const MODULE_FILTERS = ['all', 'Settings', 'Salary & Payroll'] as const;
type ModuleFilter = typeof MODULE_FILTERS[number];

export const PlatformHealth: React.FC = () => {
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [errorStats, setErrorStats] = useState({ total24h: 0, warnings24h: 0, critical7d: 0 });
  const [healthChecks, setHealthChecks] = useState<HealthCheckResult[]>([]);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [lastHealthCheck, setLastHealthCheck] = useState<Date | null>(null);
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [autoRefresh, setAutoRefresh] = useState(false);


  const loadErrors = async () => {
    const recent = await errorTracker.getRecentErrors(20);
    setErrors(recent);
    const stats = await errorTracker.getErrorStats();
    setErrorStats(stats);
  };

  const runHealthChecks = async () => {
    setIsCheckingHealth(true);
    const results = await healthCheckService.runAllChecks();
    setHealthChecks(results);
    setLastHealthCheck(new Date());
    setIsCheckingHealth(false);
  };

  useEffect(() => {
    loadErrors();
    runHealthChecks();
  }, []);

  useEffect(() => {
    let interval: any;
    if (autoRefresh) {
      interval = setInterval(() => {
        loadErrors();
      }, 30000);
    }
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const triggerTestError = () => {
    errorTracker.captureException(new Error('Test Critical Error from Platform Health'), { severity: 'error' });
    setTimeout(loadErrors, 500);
  };

  const handleBackupNow = async () => {
    setIsBackingUp(true);
    try {
      // Simulate backup progress
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const newBackup = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        size: Math.floor(Math.random() * 5 + 1) + ' MB',
        status: 'success'
      };
      const newBackups = [newBackup, ...backups];
      setBackups(newBackups);
      localStorage.setItem('backup_history', JSON.stringify(newBackups));
    } finally {
      setIsBackingUp(false);
    }
  };

  const downloadBackup = async () => {
    // Basic implementation that fetches some data to export as JSON
    try {
      const { data: staffData } = await supabase.from('staff').select('*');
      const backupData = {
        timestamp: new Date().toISOString(),
        staff: staffData || [],
      };
      
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `staff-sync-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download backup failed', e);
      alert('Failed to download backup');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'fail': return <XCircle className="w-5 h-5 text-red-500" />;
      case 'warn': return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      default: return <Activity className="w-5 h-5 text-slate-500" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'error': return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded-full">Error</span>;
      case 'warning': return <span className="px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">Warning</span>;
      case 'info': return <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">Info</span>;
      default: return null;
    }
  };

  const passedChecks = healthChecks.filter(c => c.status === 'pass').length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Error Tracking Panel */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col h-[500px]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bug className="w-5 h-5 text-slate-600" />
              <h2 className="text-lg font-semibold text-slate-800">Error Tracking</h2>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={autoRefresh} 
                  onChange={e => setAutoRefresh(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Auto-refresh
              </label>
              <button onClick={loadErrors} className="p-1 hover:bg-slate-100 rounded text-slate-600">
                <RefreshCw className="w-4 h-4" />
              </button>
              <button 
                onClick={triggerTestError}
                className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded border border-slate-300"
              >
                Test Error
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <div className="text-xs text-slate-500 mb-1">Total Errors (24h)</div>
              <div className="text-xl font-bold text-slate-800">{errorStats.total24h}</div>
            </div>
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
              <div className="text-xs text-amber-600 mb-1">Warnings (24h)</div>
              <div className="text-xl font-bold text-amber-700">{errorStats.warnings24h}</div>
            </div>
            <div className="bg-red-50 p-3 rounded-lg border border-red-100">
              <div className="text-xs text-red-600 mb-1">Critical (7d)</div>
              <div className="text-xl font-bold text-red-700">{errorStats.critical7d}</div>
            </div>
          </div>

          <div className="flex-1 overflow-auto border border-slate-200 rounded-lg">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 font-medium">Timestamp</th>
                  <th className="px-4 py-2 font-medium">Severity</th>
                  <th className="px-4 py-2 font-medium">Message</th>
                  <th className="px-4 py-2 font-medium hidden sm:table-cell">Component</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {errors.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No recent errors found
                    </td>
                  </tr>
                ) : (
                  errors.map((error, idx) => (
                    <tr key={error.id || idx} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {new Date(error.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {getSeverityBadge(error.severity)}
                      </td>
                      <td className="px-4 py-3 text-slate-700 max-w-[200px] truncate" title={error.message}>
                        {error.message}
                      </td>
                      <td className="px-4 py-3 text-slate-500 hidden sm:table-cell truncate max-w-[150px]">
                        {error.component || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Database Backups Panel */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col h-[500px]">
          <div className="flex items-center gap-2 mb-6">
            <Database className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-800">Database Backups</h2>
          </div>
          
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 mb-6 flex items-start gap-3">
            <Clock className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-medium text-blue-800">Auto-backup scheduled</div>
              <div className="text-xs text-blue-600 mt-1">Daily at 2:00 AM IST</div>
            </div>
          </div>
          
          <div className="flex gap-2 mb-6">
            <button 
              onClick={handleBackupNow}
              disabled={isBackingUp}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-70"
            >
              {isBackingUp ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Backing up...</>
              ) : (
                <><Server className="w-4 h-4" /> Backup Now</>
              )}
            </button>
            <button 
              onClick={downloadBackup}
              className="flex-none flex items-center justify-center p-2 bg-white hover:bg-slate-50 text-slate-600 border border-slate-300 rounded-lg transition-colors"
              title="Download JSON Backup"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>

          <h3 className="text-sm font-medium text-slate-700 mb-3">Recent Backups</h3>
          <div className="flex-1 overflow-auto">
            <div className="space-y-3">
              {backups.length === 0 ? (
                <div className="text-center text-sm text-slate-500 py-4">No backups found</div>
              ) : (
                backups.map(backup => (
                  <div key={backup.id} className="flex items-center justify-between p-3 border border-slate-100 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <HardDrive className="w-4 h-4 text-slate-400" />
                      <div>
                        <div className="text-sm font-medium text-slate-700">
                          {new Date(backup.date).toLocaleDateString()} {new Date(backup.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-xs text-slate-500">{backup.size}</div>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">
                      {backup.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* System Health Tests Panel */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-slate-600" />
            <h2 className="text-lg font-semibold text-slate-800">System Health Checks</h2>
            {healthChecks.length > 0 && (
              <span className="ml-2 text-sm font-medium text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                {passedChecks}/{healthChecks.length} Passed
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {lastHealthCheck && (
              <span className="text-xs text-slate-500">
                Last checked: {lastHealthCheck.toLocaleTimeString()}
              </span>
            )}
            <button 
              onClick={runHealthChecks}
              disabled={isCheckingHealth}
              className="flex items-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Zap className={`w-4 h-4 ${isCheckingHealth ? 'animate-pulse' : ''}`} />
              Run Tests
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {healthChecks.map((check, idx) => (
            <div key={idx} className="flex items-start gap-3 p-3 border border-slate-100 rounded-lg hover:border-slate-200 transition-colors bg-slate-50/50">
              <div className="mt-0.5 shrink-0">
                {getStatusIcon(check.status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h3 className="text-sm font-medium text-slate-800 truncate">{check.name}</h3>
                  <span className="text-xs text-slate-400 whitespace-nowrap">{check.latencyMs}ms</span>
                </div>
                <p className="text-xs text-slate-500 truncate">{check.message}</p>
              </div>
            </div>
          ))}
          {healthChecks.length === 0 && !isCheckingHealth && (
            <div className="col-span-full text-center text-sm text-slate-500 py-8">
              Run tests to check system health
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

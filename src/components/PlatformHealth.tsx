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

  const visibleErrors = errors.filter(
    e => moduleFilter === 'all' || (e.component || '').includes(moduleFilter),
  );


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
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col h-[500px]">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Bug className="w-5 h-5 text-slate-600" />
              <h2 className="text-lg font-semibold text-slate-800">Runtime Error Tracking</h2>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={moduleFilter}
                onChange={e => setModuleFilter(e.target.value as ModuleFilter)}
                className="text-sm border border-slate-300 rounded-lg px-2 py-1 text-slate-700"
              >
                {MODULE_FILTERS.map(m => (
                  <option key={m} value={m}>{m === 'all' ? 'All modules' : m}</option>
                ))}
              </select>
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
                  <th className="px-4 py-2 font-medium w-8"></th>
                  <th className="px-4 py-2 font-medium">Timestamp</th>
                  <th className="px-4 py-2 font-medium">Severity</th>
                  <th className="px-4 py-2 font-medium">Message</th>
                  <th className="px-4 py-2 font-medium hidden sm:table-cell">Component</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {visibleErrors.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No recent errors found
                    </td>
                  </tr>
                ) : (
                  visibleErrors.map((error, idx) => {
                    const key = error.id || String(idx);
                    const isOpen = !!expanded[key];
                    return (
                      <React.Fragment key={key}>
                        <tr
                          className="hover:bg-slate-50 cursor-pointer"
                          onClick={() => setExpanded(prev => ({ ...prev, [key]: !prev[key] }))}
                        >
                          <td className="px-4 py-3 text-slate-400">
                            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                            {new Date(error.timestamp).toLocaleTimeString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {getSeverityBadge(error.severity)}
                          </td>
                          <td className="px-4 py-3 text-slate-700 max-w-[280px] truncate" title={error.message}>
                            {error.message}
                          </td>
                          <td className="px-4 py-3 text-slate-500 hidden sm:table-cell truncate max-w-[180px]">
                            {error.component || '-'}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-slate-50">
                            <td colSpan={5} className="px-4 py-3">
                              <div className="text-xs text-slate-500 mb-1">{error.url}</div>
                              <pre className="text-xs text-slate-700 whitespace-pre-wrap max-h-48 overflow-auto">
                                {error.stack_trace || 'No stack trace captured'}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
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

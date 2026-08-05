import { supabase } from '../lib/supabase';

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface ErrorLog {
  id?: string;
  message: string;
  stack_trace?: string;
  component?: string;
  user_agent: string;
  url: string;
  timestamp: string;
  severity: ErrorSeverity;
  browser_info?: any;
}

class ErrorTrackingService {
  private isInitialized = false;
  private lastErrorTime = 0;
  private BATCH_INTERVAL_MS = 1000;
  private recentErrors: ErrorLog[] = [];

  init() {
    if (this.isInitialized) return;

    window.addEventListener('error', (event) => {
      this.captureException(event.error || new Error(event.message), {
        component: 'window.onerror'
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.captureException(event.reason || new Error('Unhandled Promise Rejection'), {
        component: 'window.onunhandledrejection'
      });
    });

    this.isInitialized = true;
    console.log('ErrorTrackingService initialized');
  }

  async captureException(error: any, context?: { component?: string, severity?: ErrorSeverity }) {
    const now = Date.now();
    if (now - this.lastErrorTime < this.BATCH_INTERVAL_MS) return;
    this.lastErrorTime = now;

    let message = 'Unknown error';
    let stackTrace = '';

    if (error instanceof Error) {
      message = error.message;
      stackTrace = error.stack || '';
    } else if (typeof error === 'string') {
      message = error;
    } else {
      try { message = JSON.stringify(error); } catch { message = String(error); }
    }

    const errorLog: ErrorLog = {
      id: crypto.randomUUID(),
      message,
      stack_trace: stackTrace,
      component: context?.component || 'unknown',
      user_agent: navigator.userAgent,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      severity: context?.severity || 'error',
      browser_info: {
        screen_size: `${window.innerWidth}x${window.innerHeight}`,
        app_version: '1.0.0',
      }
    };

    this.recentErrors.unshift(errorLog);
    if (this.recentErrors.length > 200) this.recentErrors.pop();

    try {
      const stored = JSON.parse(localStorage.getItem('error_logs_cache') || '[]');
      stored.unshift(errorLog);
      if (stored.length > 200) stored.length = 200;
      localStorage.setItem('error_logs_cache', JSON.stringify(stored));
    } catch { /* localStorage full or unavailable */ }

    try {
      await (supabase as any).from('error_logs').insert([{
        message: errorLog.message,
        stack_trace: errorLog.stack_trace,
        component: errorLog.component,
        user_agent: errorLog.user_agent,
        url: errorLog.url,
        timestamp: errorLog.timestamp,
        severity: errorLog.severity,
        browser_info: errorLog.browser_info,
      }]);
    } catch { /* table may not exist yet */ }
  }

  async captureMessage(message: string, severity: ErrorSeverity = 'info') {
    return this.captureException(new Error(message), { severity, component: 'captureMessage' });
  }

  async getRecentErrors(limit: number = 50): Promise<ErrorLog[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('error_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(limit);
      if (!error && data && data.length > 0) return data as ErrorLog[];
    } catch { /* table might not exist */ }

    try {
      const stored: ErrorLog[] = JSON.parse(localStorage.getItem('error_logs_cache') || '[]');
      const merged = new Map<string, ErrorLog>();
      for (const e of this.recentErrors) if (e.id) merged.set(e.id, e);
      for (const e of stored) if (e.id) merged.set(e.id, e);
      return Array.from(merged.values())
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    } catch {
      return this.recentErrors.slice(0, limit);
    }
  }

  async getErrorStats() {
    const errors = await this.getRecentErrors(200);
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const stats = { total24h: 0, warnings24h: 0, critical7d: 0 };

    errors.forEach(log => {
      const logTime = new Date(log.timestamp).getTime();
      if (logTime >= oneDayAgo) {
        if (log.severity === 'error') stats.total24h++;
        if (log.severity === 'warning') stats.warnings24h++;
      }
      if (log.severity === 'error') stats.critical7d++;
    });

    return stats;
  }

  clearErrors() {
    this.recentErrors = [];
    try { localStorage.removeItem('error_logs_cache'); } catch { /* ignore */ }
  }
}

export const errorTracker = new ErrorTrackingService();

import { AuditLog } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const STORAGE_KEY = 'staff_sync_audit_logs';

export const auditLogService = {
  /** Retrieve all audit logs ordered by timestamp descending */
  async getLogs(): Promise<AuditLog[]> {
    const localLogsJson = localStorage.getItem(STORAGE_KEY);
    let localLogs: AuditLog[] = [];
    if (localLogsJson) {
      try {
        localLogs = JSON.parse(localLogsJson);
      } catch (e) {
        console.error('Failed to parse local audit logs', e);
      }
    }

    // Attempt to fetch remote logs if configured
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('audit_logs')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(200);

        if (!error && data) {
          // Merge local and remote avoiding duplicate IDs
          const remoteLogs: AuditLog[] = data.map((d: any) => ({
            id: d.id,
            action: d.action,
            staffId: d.staff_id,
            staffName: d.staff_name,
            details: d.details,
            performedBy: d.performed_by,
            timestamp: d.timestamp
          }));

          const mergedMap = new Map<string, AuditLog>();
          [...localLogs, ...remoteLogs].forEach(log => mergedMap.set(log.id, log));
          return Array.from(mergedMap.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        }
      } catch (err) {
        // Fallback gracefully to local logs if remote table does not exist yet
      }
    }

    return localLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },

  /** Record a secure audit log entry */
  async log(entry: Omit<AuditLog, 'id' | 'timestamp'>): Promise<AuditLog> {
    const newLog: AuditLog = {
      ...entry,
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString()
    };

    // 1. Save to LocalStorage immediately to guarantee record preservation
    try {
      const existingLogsJson = localStorage.getItem(STORAGE_KEY);
      const existingLogs: AuditLog[] = existingLogsJson ? JSON.parse(existingLogsJson) : [];
      // Keep recent 500 logs locally to prevent unbounded quota growth
      const updatedLogs = [newLog, ...existingLogs].slice(0, 500);
      localStorage.setItem(STORAGE_KEY, JSON.parse(JSON.stringify(updatedLogs)));
    } catch (e) {
      console.error('Failed to persist audit log locally', e);
    }

    // 2. Attempt push to Supabase if available
    if (isSupabaseConfigured()) {
      try {
        await supabase.from('audit_logs').insert([{
          id: newLog.id,
          action: newLog.action,
          staff_id: newLog.staffId,
          staff_name: newLog.staffName,
          details: newLog.details,
          performed_by: newLog.performedBy,
          timestamp: newLog.timestamp
        }]);
      } catch (err) {
        // Completely non-fatal: remote table missing/RLS block does not disrupt user operations
      }
    }

    console.log(`[AuditLog] Recorded action '${newLog.action}' by ${newLog.performedBy}`);
    return newLog;
  },

  /** Clear local audit logs */
  async clearLogs(): Promise<void> {
    localStorage.removeItem(STORAGE_KEY);
    // Optional cloud clear logic could go here if requested
  }
};

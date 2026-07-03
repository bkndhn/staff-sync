import { AuditLog, AuditLogChange } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const STORAGE_KEY = 'staff_sync_audit_logs';

/** Diff two flat objects and return only changed scalar fields. */
export function diffObjects(
  before: Record<string, any> | undefined | null,
  after: Record<string, any> | undefined | null,
  labelMap?: Record<string, string>,
  ignoreKeys: string[] = ['updated_at', 'updatedAt', 'created_at', 'createdAt', 'id']
): AuditLogChange[] {
  const changes: AuditLogChange[] = [];
  if (!before && !after) return changes;
  const keys = new Set<string>([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  for (const key of keys) {
    if (ignoreKeys.includes(key)) continue;
    const oldValue = before?.[key];
    const newValue = after?.[key];
    if (newValue === undefined) continue; // only report keys that are being set/changed
    // Compare with JSON stringify for objects/arrays; primitives compare directly
    const oldStr = typeof oldValue === 'object' ? JSON.stringify(oldValue ?? null) : String(oldValue ?? '');
    const newStr = typeof newValue === 'object' ? JSON.stringify(newValue ?? null) : String(newValue ?? '');
    if (oldStr !== newStr) {
      changes.push({
        field: key,
        label: labelMap?.[key] ?? key,
        oldValue: oldValue ?? null,
        newValue: newValue ?? null,
      });
    }
  }
  return changes;
}

export const auditLogService = {
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

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await (supabase as any)
          .from('audit_logs')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(500);

        if (!error && data) {
          const remoteLogs: AuditLog[] = data.map((d: any) => ({
            id: d.id,
            action: d.action,
            staffId: d.staff_id,
            staffName: d.staff_name,
            details: d.details,
            performedBy: d.performed_by,
            timestamp: d.timestamp,
            changes: d.changes ?? undefined,
            before: d.before ?? undefined,
            after: d.after ?? undefined,
          }));
          const mergedMap = new Map<string, AuditLog>();
          [...localLogs, ...remoteLogs].forEach(log => mergedMap.set(log.id, log));
          return Array.from(mergedMap.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        }
      } catch { /* fall through */ }
    }

    return localLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },

  async log(entry: Omit<AuditLog, 'id' | 'timestamp'>): Promise<AuditLog> {
    // Compute diff if before/after supplied and no explicit changes array
    let changes = entry.changes;
    if (!changes && (entry.before || entry.after)) {
      changes = diffObjects(entry.before, entry.after);
    }

    const newLog: AuditLog = {
      ...entry,
      changes,
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString(),
    };

    // Persist locally (BUG FIX: was passing object to setItem, so nothing was ever saved)
    try {
      const existingJson = localStorage.getItem(STORAGE_KEY);
      const existing: AuditLog[] = existingJson ? JSON.parse(existingJson) : [];
      const updated = [newLog, ...existing].slice(0, 500);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to persist audit log locally', e);
    }

    if (isSupabaseConfigured) {
      try {
        await (supabase as any).from('audit_logs').insert([{
          id: newLog.id,
          action: newLog.action,
          staff_id: newLog.staffId,
          staff_name: newLog.staffName ?? null,
          details: newLog.details,
          performed_by: newLog.performedBy,
          timestamp: newLog.timestamp,
          changes: newLog.changes ?? null,
          before: newLog.before ?? null,
          after: newLog.after ?? null,
        }]);
      } catch { /* non-fatal */ }
    }

    return newLog;
  },

  async clearLogs(): Promise<void> {
    localStorage.removeItem(STORAGE_KEY);
  },
};

import { dataApi } from '../lib/dataApi';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://nsmppwnpdxomjmgrtqka.supabase.co';
const PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export interface NotificationPreferences {
  id?: string;
  tenantId?: string;
  dailyAttendanceEnabled: boolean;
  dailyAttendanceTime: string; // HH:MM
  timezone: string;
  uninformedLeaveEnabled: boolean;
  salaryCreditEnabled: boolean;
  lastDailySentDate?: string | null;
}

export interface NotificationLogEntry {
  id: string;
  category: string;
  audience: string;
  title: string;
  body?: string | null;
  status: string;
  pushCount: number;
  createdAt: string;
}

const DEFAULT_PREFS: NotificationPreferences = {
  dailyAttendanceEnabled: false,
  dailyAttendanceTime: '19:00',
  timezone: 'Asia/Kolkata',
  uninformedLeaveEnabled: true,
  salaryCreditEnabled: true,
};

const getSessionToken = (): string | null => {
  try {
    const direct = localStorage.getItem('sessionToken');
    if (direct) return direct;
    const saved = localStorage.getItem('staffManagementLogin');
    return saved ? JSON.parse(saved)?.sessionToken || null : null;
  } catch {
    return null;
  }
};

async function callFunction(payload: Record<string, unknown>): Promise<any> {
  const token = getSessionToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/notifications`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: PUBLISHABLE_KEY,
      ...(token
        ? { 'x-session-token': token, ...(token.startsWith('eyJ') ? { Authorization: `Bearer ${token}` } : {}) }
        : {}),
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Notification request failed');
  return json;
}

export const notificationAlertsService = {
  async getPreferences(): Promise<NotificationPreferences> {
    const { data, error } = await dataApi
      .from('notification_preferences')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return { ...DEFAULT_PREFS };
    const row: any = data[0];
    return {
      id: row.id,
      tenantId: row.tenant_id,
      dailyAttendanceEnabled: !!row.daily_attendance_enabled,
      dailyAttendanceTime: String(row.daily_attendance_time || '19:00').slice(0, 5),
      timezone: row.timezone || 'Asia/Kolkata',
      uninformedLeaveEnabled: row.uninformed_leave_enabled !== false,
      salaryCreditEnabled: row.salary_credit_enabled !== false,
      lastDailySentDate: row.last_daily_sent_date,
    };
  },

  async savePreferences(prefs: NotificationPreferences): Promise<boolean> {
    const values: Record<string, unknown> = {
      daily_attendance_enabled: prefs.dailyAttendanceEnabled,
      daily_attendance_time: `${prefs.dailyAttendanceTime}:00`,
      timezone: prefs.timezone,
      uninformed_leave_enabled: prefs.uninformedLeaveEnabled,
      salary_credit_enabled: prefs.salaryCreditEnabled,
    };

    if (prefs.id) {
      const { error } = await dataApi.from('notification_preferences').update(values).eq('id', prefs.id);
      return !error;
    }
    const { error } = await dataApi.from('notification_preferences').insert(values);
    return !error;
  },

  async getLog(limit = 50): Promise<NotificationLogEntry[]> {
    const { data, error } = await dataApi
      .from('notification_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data.map((row: any) => ({
      id: row.id,
      category: row.category,
      audience: row.audience,
      title: row.title,
      body: row.body,
      status: row.status,
      pushCount: row.push_count ?? 0,
      createdAt: row.created_at,
    }));
  },

  async broadcastSalaryCredit(input: { monthYear?: string; month?: number; year?: number; message?: string }) {
    return callFunction({ action: 'salary_credit', ...input });
  },

  async notifyUninformedLeave(input: { staffName?: string; location?: string; floor?: string; date: string }) {
    try {
      return await callFunction({ action: 'uninformed_leave', ...input });
    } catch (err) {
      console.warn('Uninformed leave alert failed', err);
      return null;
    }
  },

  async sendDailySummaryNow(date?: string) {
    return callFunction({ action: 'daily_attendance_test', date });
  },
};

export default notificationAlertsService;

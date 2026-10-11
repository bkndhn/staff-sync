import { supabase } from '../lib/supabase';

export interface UserPreference {
  id?: string;
  key: string;
  value: any;
}

// Local copy so a toggle never "springs back" when the server write is slow
// or rejected; the server value still wins once it is readable.
const scope = () => {
  try {
    const raw = localStorage.getItem('staffManagementLogin');
    const u = raw ? JSON.parse(raw)?.user : null;
    return `${localStorage.getItem('impersonateTenantId') || u?.tenantId || 't'}:${u?.email || 'u'}`;
  } catch { return 't:u'; }
};
const lk = (key: string) => `pref:${scope()}:${key}`;
const readLocal = (key: string): { v: any } | null => {
  try { const r = localStorage.getItem(lk(key)); return r ? JSON.parse(r) : null; } catch { return null; }
};
const writeLocal = (key: string, value: any) => {
  try { localStorage.setItem(lk(key), JSON.stringify({ v: value })); } catch { /* ignore */ }
};

export const userPreferencesService = {
  async getPreference<T>(key: string, defaultValue: T): Promise<T> {
    const local = readLocal(key);
    try {
      const { data, error } = await supabase
        .from('user_preferences' as any)
        .select('value')
        .eq('key', key)
        .maybeSingle();
      if (error || !data) return local ? (local.v as T) : defaultValue;
      const v = (data as any).value as T;
      writeLocal(key, v);
      return v;
    } catch {
      return local ? (local.v as T) : defaultValue;
    }
  },

  async setPreference(key: string, value: any): Promise<void> {
    writeLocal(key, value);
    try {
      const { error } = await supabase
        .from('user_preferences' as any)
        .upsert({ key, value } as any, { onConflict: 'tenant_id,user_id,key' });
      if (error) console.warn(`Preference ${key} saved on this device only:`, error.message);
    } catch (err) {
      console.warn(`Preference ${key} saved on this device only`, err);
    }
  },

  async removePreference(key: string): Promise<void> {
    try { localStorage.removeItem(lk(key)); } catch { /* ignore */ }
    try {
      await supabase.from('user_preferences' as any).delete().eq('key', key);
    } catch { /* ignore */ }
  }
};

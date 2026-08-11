import { supabase } from '../lib/supabase';

export interface UserPreference {
  id?: string;
  key: string;
  value: any;
}

export const userPreferencesService = {
  async getPreference<T>(key: string, defaultValue: T): Promise<T> {
    try {
      const { data, error } = await supabase
        .from('user_preferences' as any)
        .select('value')
        .eq('key', key)
        .maybeSingle();

      if (error) {
        console.error(`Error fetching preference ${key}:`, error);
        return defaultValue;
      }

      return data ? ((data as any).value as T) : defaultValue;
    } catch (err) {
      console.error(`Exception fetching preference ${key}:`, err);
      return defaultValue;
    }
  },

  async setPreference(key: string, value: any): Promise<void> {
    try {
      // Upsert by key (unique on tenant_id, user_id, key)
      const { error } = await supabase
        .from('user_preferences' as any)
        .upsert({ key, value } as any, { onConflict: 'tenant_id,user_id,key' });

      if (error) {
        console.error(`Error setting preference ${key}:`, error);
      }
    } catch (err) {
      console.error(`Exception setting preference ${key}:`, err);
    }
  },

  async removePreference(key: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_preferences' as any)
        .delete()
        .eq('key', key);

      if (error) {
        console.error(`Error removing preference ${key}:`, error);
      }
    } catch (err) {
      console.error(`Exception removing preference ${key}:`, err);
    }
  }
};

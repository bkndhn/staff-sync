import { supabase } from '../lib/supabase';

export const appSettingsService = {
  async getSetting(key: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .single();

    if (error) {
      console.error('Error fetching setting:', error);
      return null;
    }
    return data?.value || null;
  },

  async setSetting(key: string, value: string): Promise<boolean> {
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

    if (error) {
      console.error('Error saving setting:', error);
      return false;
    }
    return true;
  },

  async getDefaultHikeInterval(): Promise<number> {
    const val = await this.getSetting('default_hike_interval_months');
    return val ? parseInt(val, 10) : 12;
  },

  async setDefaultHikeInterval(months: number): Promise<boolean> {
    return this.setSetting('default_hike_interval_months', String(months));
  }
};

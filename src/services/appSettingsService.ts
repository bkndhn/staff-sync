import { supabase } from '../lib/supabase';
import { dataApi } from '../lib/dataApi';

// ─── Phase 3 cutover flag ─────────────────────────────────────────────────
// Flip VITE_USE_DATA_API_APP_SETTINGS=1 to route through the edge function.
// Instant rollback: unset the flag (or set it to 0) → falls back to direct
// PostgREST via the supabase-js client. Zero code change required.
const USE_DATA_API =
  (import.meta.env.VITE_USE_DATA_API_APP_SETTINGS ?? '1') !== '0';

// Both clients expose the same chainable surface used below (.from().select().eq().maybeSingle().upsert().in()).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const client = (): any => (USE_DATA_API ? dataApi : supabase);


export const appSettingsService = {
  async getSetting(key: string): Promise<string | null> {
    const { data, error } = await client()
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      console.error('Error fetching setting:', error);
      return null;
    }
    return (data as { value?: string } | null)?.value || null;
  },

  async setSetting(key: string, value: string): Promise<boolean> {
    // Capture the previous value so the audit trail records a before/after diff.
    let previous: string | null = null;
    try { previous = await this.getSetting(key); } catch { previous = null; }

    const { error } = await client()
      .from('app_settings')
      .upsert(
        { key, value, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      );

    if (error) {
      console.error('Error saving setting:', error);
      return false;
    }

    if (previous !== value) {
      const actor = currentActor();
      void auditLogService.log({
        action: 'settings_update',
        staffId: '',
        staffName: undefined,
        details: `Setting "${key}" changed`,
        performedBy: actor.name,
        before: { [key]: previous },
        after: { [key]: value },
      }).catch(() => { /* never block a settings save on audit failure */ });
    }
    return true;
  },


  async getDefaultHikeInterval(): Promise<number> {
    const val = await this.getSetting('default_hike_interval_months');
    return val ? parseInt(val, 10) : 12;
  },

  async setDefaultHikeInterval(months: number): Promise<boolean> {
    return this.setSetting('default_hike_interval_months', String(months));
  },

  async getManagerCanOverride(): Promise<boolean> {
    const val = await this.getSetting('manager_can_override');
    return val !== 'false';
  },

  async setManagerCanOverride(allowed: boolean): Promise<boolean> {
    return this.setSetting('manager_can_override', String(allowed));
  },

  async getKioskMatchThreshold(): Promise<number> {
    const val = await this.getSetting('kiosk_match_threshold');
    return val ? parseFloat(val) : 0.45;
  },

  async setKioskMatchThreshold(threshold: number): Promise<boolean> {
    return this.setSetting('kiosk_match_threshold', String(threshold));
  },

  async getAntiSpoofLevel(): Promise<'standard' | 'strict' | 'max'> {
    const val = await this.getSetting('anti_spoof_level');
    if (val === 'standard' || val === 'strict' || val === 'max') return val;
    return 'strict';
  },

  async setAntiSpoofLevel(level: 'standard' | 'strict' | 'max'): Promise<boolean> {
    return this.setSetting('anti_spoof_level', level);
  },

  async getKioskMorningCutoff(): Promise<string> {
    const val = await this.getSetting('kiosk_morning_cutoff');
    return val || '12:00';
  },

  async getKioskEarlyExitTime(): Promise<string> {
    const val = await this.getSetting('kiosk_early_exit_time');
    return val || '16:00';
  },

  async getKioskFullDayRequiresMorning(): Promise<boolean> {
    const val = await this.getSetting('kiosk_full_day_requires_morning');
    return val !== 'false';
  },

  /** Fetch all kiosk global settings in one round-trip. */
  async getKioskGlobalSettings(): Promise<{
    morningCutoff: string;
    earlyExitTime: string;
    eveningVerificationTime: string;
    fullDayRequiresMorning: boolean;
    matchThreshold: number;
    antiSpoofLevel: 'standard' | 'strict' | 'max';
    managerCanOverride: boolean;
  }> {
    const { data } = await client()
      .from('app_settings')
      .select('key, value')
      .in('key', [
        'kiosk_morning_cutoff',
        'kiosk_early_exit_time',
        'kiosk_evening_verification_time',
        'kiosk_full_day_requires_morning',
        'kiosk_match_threshold',
        'anti_spoof_level',
        'manager_can_override',
      ]);

    const rows = (data as Array<{ key: string; value: string }> | null) || [];
    const map = new Map<string, string>();
    rows.forEach(row => map.set(row.key, row.value));

    const antiSpoof = map.get('anti_spoof_level') || 'strict';
    return {
      morningCutoff: map.get('kiosk_morning_cutoff') || '12:00',
      earlyExitTime: map.get('kiosk_early_exit_time') || '16:00',
      eveningVerificationTime: map.get('kiosk_evening_verification_time') || '18:00',
      fullDayRequiresMorning: map.get('kiosk_full_day_requires_morning') !== 'false',
      matchThreshold: parseFloat(map.get('kiosk_match_threshold') || '0.55'),
      antiSpoofLevel: (antiSpoof === 'standard' || antiSpoof === 'strict' || antiSpoof === 'max')
        ? (antiSpoof as 'standard' | 'strict' | 'max') : 'strict',
      managerCanOverride: map.get('manager_can_override') !== 'false',
    };
  },
  async getTenantFeatureFlag(flagKey: string, defaultValue: boolean = true): Promise<boolean> {
    const val = await this.getSetting(flagKey);
    return val !== null ? val === 'true' : defaultValue;
  },

  async setTenantFeatureFlag(flagKey: string, isEnabled: boolean): Promise<boolean> {
    return this.setSetting(flagKey, String(isEnabled));
  },

  async getEnablePayrollModule(): Promise<boolean> { return this.getTenantFeatureFlag('feature_payroll_module', true); },
  async setEnablePayrollModule(enabled: boolean): Promise<boolean> { return this.setTenantFeatureFlag('feature_payroll_module', enabled); },

  async getEnableBiometricsModule(): Promise<boolean> { return this.getTenantFeatureFlag('feature_biometrics_module', true); },
  async setEnableBiometricsModule(enabled: boolean): Promise<boolean> { return this.setTenantFeatureFlag('feature_biometrics_module', enabled); },

  async getEnableStatutoryCompliance(): Promise<boolean> { return this.getTenantFeatureFlag('feature_statutory_compliance', true); },
  async setEnableStatutoryCompliance(enabled: boolean): Promise<boolean> { return this.setTenantFeatureFlag('feature_statutory_compliance', enabled); },

  async getEnableAccommodationTracking(): Promise<boolean> { return this.getTenantFeatureFlag('feature_accommodation_tracking', true); },
  async setEnableAccommodationTracking(enabled: boolean): Promise<boolean> { return this.setTenantFeatureFlag('feature_accommodation_tracking', enabled); },
};

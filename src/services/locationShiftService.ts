import { supabase } from '../lib/supabase';
import { appSettingsService } from './appSettingsService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LocationShiftConfig {
  id?: string;
  locationName: string;
  /** Shift start HH:MM 24h */
  shiftStart: string;
  /** Shift end HH:MM 24h */
  shiftEnd: string;
  /** Minutes late before status flips to Half Day */
  graceLateMin: number;
  /** Minutes early-leave before status flips to Half Day */
  graceEarlyMin: number;
  /** Minimum worked hours for Full Day status */
  minHoursFull: number;
  /** Minimum worked hours for Half Day (below = Absent) */
  minHoursHalf: number;
  /** Entries BEFORE this time are "morning arrivals" → eligible for Full Day */
  morningCutoff: string;
  /** If OUT is recorded BEFORE this time, override Full Day → Half Day */
  earlyExitTime: string;
  /** Evening threshold to finalize Pending Full Day to Full Day */
  eveningVerificationTime: string;
  /** If true, staff must arrive before morningCutoff to qualify for Full Day */
  fullDayRequiresMorning: boolean;
  /** Whether the manager for this location can override attendance */
  allowManagerOverride: boolean;
}

export const DEFAULT_LOCATION_CONFIG: Omit<LocationShiftConfig, 'locationName'> = {
  shiftStart: '09:00',
  shiftEnd: '18:00',
  graceLateMin: 15,
  graceEarlyMin: 15,
  minHoursFull: 8,
  minHoursHalf: 4,
  morningCutoff: '12:00',
  earlyExitTime: '16:00',
  eveningVerificationTime: '18:00',
  fullDayRequiresMorning: true,
  allowManagerOverride: true,
};

// ─── Row mapper ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toConfig = (row: any): LocationShiftConfig => ({
  id: row.id,
  locationName: row.location_name,
  shiftStart: row.shift_start ?? '09:00',
  shiftEnd: row.shift_end ?? '18:00',
  graceLateMin: row.grace_late_min ?? 15,
  graceEarlyMin: row.grace_early_min ?? 15,
  minHoursFull: Number(row.min_hours_full ?? 8),
  minHoursHalf: Number(row.min_hours_half ?? 4),
  morningCutoff: row.morning_cutoff ?? '12:00',
  earlyExitTime: row.early_exit_time ?? '16:00',
  eveningVerificationTime: row.evening_verification_time ?? '18:00',
  fullDayRequiresMorning: row.full_day_requires_morning ?? true,
  allowManagerOverride: row.allow_manager_override ?? true,
});

// ─── Global defaults cache ────────────────────────────────────────────────────
// We also read global fallback values from app_settings (admin can set them).

let globalCache: { morningCutoff: string; earlyExitTime: string; eveningVerificationTime: string; fullDayRequiresMorning: boolean } | null = null;

const loadGlobalDefaults = async () => {
  if (globalCache) return globalCache;
  const [mc, ee, ev, fd] = await Promise.all([
    appSettingsService.getSetting('kiosk_morning_cutoff'),
    appSettingsService.getSetting('kiosk_early_exit_time'),
    appSettingsService.getSetting('kiosk_evening_verification_time'),
    appSettingsService.getSetting('kiosk_full_day_requires_morning'),
  ]);
  globalCache = {
    morningCutoff: mc || '12:00',
    earlyExitTime: ee || '16:00',
    eveningVerificationTime: ev || '18:00',
    fullDayRequiresMorning: fd !== 'false',
  };
  return globalCache;
};

// ─── Service ──────────────────────────────────────────────────────────────────

export const locationShiftService = {
  /** Invalidate global defaults cache (call after admin saves settings). */
  invalidateGlobalCache() {
    globalCache = null;
  },

  /** Fetch all location configs (admin view). */
  async listAll(): Promise<LocationShiftConfig[]> {
    const { data, error } = await supabase
      .from('location_shift_config')
      .select('*')
      .order('location_name');
    if (error) {
      console.error('locationShiftService.listAll error:', error);
      return [];
    }
    return (data || []).map(toConfig);
  },

  /**
   * Get effective config for one location.
   * Falls back to global app_settings defaults, then hardcoded defaults.
   */
  async getForLocation(locationName: string): Promise<LocationShiftConfig> {
    const [row, globalDefs] = await Promise.all([
      supabase
        .from('location_shift_config')
        .select('*')
        .eq('location_name', locationName)
        .maybeSingle(),
      loadGlobalDefaults(),
    ]);

    if (row.data) {
      return toConfig(row.data);
    }

    // No per-location row → return defaults merged with global app_settings
    return {
      ...DEFAULT_LOCATION_CONFIG,
      locationName,
      morningCutoff: globalDefs.morningCutoff,
      earlyExitTime: globalDefs.earlyExitTime,
      eveningVerificationTime: globalDefs.eveningVerificationTime,
      fullDayRequiresMorning: globalDefs.fullDayRequiresMorning,
    };
  },

  /** Upsert a location config. */
  async upsert(config: LocationShiftConfig): Promise<LocationShiftConfig | null> {
    const payload = {
      location_name: config.locationName,
      shift_start: config.shiftStart,
      shift_end: config.shiftEnd,
      grace_late_min: config.graceLateMin,
      grace_early_min: config.graceEarlyMin,
      min_hours_full: config.minHoursFull,
      min_hours_half: config.minHoursHalf,
      morning_cutoff: config.morningCutoff,
      early_exit_time: config.earlyExitTime,
      evening_verification_time: config.eveningVerificationTime,
      full_day_requires_morning: config.fullDayRequiresMorning,
      allow_manager_override: config.allowManagerOverride,
    };

    const { data, error } = await supabase
      .from('location_shift_config')
      .upsert(payload, { onConflict: 'location_name' })
      .select()
      .single();

    if (error) {
      console.error('locationShiftService.upsert error:', error);
      return null;
    }
    return toConfig(data);
  },

  /** Delete a location config (resets it to global defaults). */
  async deleteByLocation(locationName: string): Promise<boolean> {
    const { error } = await supabase
      .from('location_shift_config')
      .delete()
      .eq('location_name', locationName);
    if (error) {
      console.error('locationShiftService.deleteByLocation error:', error);
      return false;
    }
    return true;
  },
};

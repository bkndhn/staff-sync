import { dataApi } from '../lib/dataApi';
import { supabase } from '../lib/supabase';
import { db } from '../lib/db';
import { type BranchDesignationShiftConfig } from '../types';

const toConfig = (row: any): BranchDesignationShiftConfig => ({
  id: row.id,
  locationName: row.location_name,
  designationId: row.designation_id,
  shiftStart: row.shift_start ?? undefined,
  shiftEnd: row.shift_end ?? undefined,
  graceLateMin: row.grace_late_min !== null && row.grace_late_min !== undefined ? Number(row.grace_late_min) : undefined,
  graceEarlyMin: row.grace_early_min !== null && row.grace_early_min !== undefined ? Number(row.grace_early_min) : undefined,
  minHoursFull: row.min_hours_full !== null && row.min_hours_full !== undefined ? Number(row.min_hours_full) : undefined,
  minHoursHalf: row.min_hours_half !== null && row.min_hours_half !== undefined ? Number(row.min_hours_half) : undefined,
  morningCutoff: row.morning_cutoff ?? undefined,
  earlyExitTime: row.early_exit_time ?? undefined,
  eveningVerificationTime: row.evening_verification_time ?? undefined,
  fullDayRequiresMorning: row.full_day_requires_morning ?? undefined,
  lateDeductionRate: row.late_deduction_rate !== null && row.late_deduction_rate !== undefined ? Number(row.late_deduction_rate) : undefined,
  earlyDeductionRate: row.early_deduction_rate !== null && row.early_deduction_rate !== undefined ? Number(row.early_deduction_rate) : undefined,
  createdAt: row.created_at ?? undefined,
  updatedAt: row.updated_at ?? undefined,
});

export const locationDesignationShiftService = {
  /** Fetch all location-designation configs and sync to Dexie */
  async listAll(): Promise<LocationDesignationShiftConfig[]> {
    if (!navigator.onLine) {
      try {
        const cached = await db.locationDesignationShiftConfig.toArray();
        return cached;
      } catch (err) {
        console.error('Dexie read error for locationDesignationShiftConfig:', err);
        return [];
      }
    }

    const { data, error } = await dataApi
      .from('location_designation_shift_config')
      .select('*')
      .order('location_name');

    if (error) {
      console.error('locationDesignationShiftService.listAll error:', error);
      return [];
    }

    const mapped = (data || []).map(toConfig);

    // Sync to local database
    try {
      await db.locationDesignationShiftConfig.clear();
      if (mapped.length > 0) {
        await db.locationDesignationShiftConfig.bulkPut(mapped);
      }
    } catch (err) {
      console.error('Dexie sync error for locationDesignationShiftConfig:', err);
    }

    return mapped;
  },

  /** Get configs for one location */
  async getForLocation(locationName: string): Promise<LocationDesignationShiftConfig[]> {
    if (!navigator.onLine) {
      try {
        return await db.locationDesignationShiftConfig.where('locationName').equals(locationName).toArray();
      } catch {
        return [];
      }
    }

    const { data, error } = await dataApi
      .from('location_designation_shift_config')
      .select('*')
      .eq('location_name', locationName);

    if (error) {
      console.error('locationDesignationShiftService.getForBranch error:', error);
      return [];
    }

    return (data || []).map(toConfig);
  },

  /** Upsert a config */
  async upsert(config: BranchDesignationShiftConfig): Promise<LocationDesignationShiftConfig | null> {
    const payload = {
      location_name: config.locationName,
      designation_id: config.designationId,
      shift_start: config.shiftStart || null,
      shift_end: config.shiftEnd || null,
      grace_late_min: config.graceLateMin !== undefined ? config.graceLateMin : null,
      grace_early_min: config.graceEarlyMin !== undefined ? config.graceEarlyMin : null,
      min_hours_full: config.minHoursFull !== undefined ? config.minHoursFull : null,
      min_hours_half: config.minHoursHalf !== undefined ? config.minHoursHalf : null,
      morning_cutoff: config.morningCutoff || null,
      early_exit_time: config.earlyExitTime || null,
      evening_verification_time: config.eveningVerificationTime || null,
      full_day_requires_morning: config.fullDayRequiresMorning !== undefined ? config.fullDayRequiresMorning : null,
      late_deduction_rate: config.lateDeductionRate !== undefined ? config.lateDeductionRate : null,
      early_deduction_rate: config.earlyDeductionRate !== undefined ? config.earlyDeductionRate : null,
      updated_at: new Date().toISOString()
    };

    if (config.id) {
      (payload as any).id = config.id;
    }

    const { data, error } = await dataApi
      .from('location_designation_shift_config')
      .upsert(payload, { onConflict: 'location_name,designation_id' })
      .select()
      .single();

    if (error) {
      console.error('locationDesignationShiftService.upsert error:', error);
      return null;
    }

    const result = toConfig(data);

    // Update locally
    try {
      await db.locationDesignationShiftConfig.put(result);
    } catch (err) {
      console.error('Dexie put error for locationDesignationShiftConfig:', err);
    }

    return result;
  },

  /** Delete a config */
  async delete(id: string): Promise<boolean> {
    const { error } = await dataApi
      .from('location_designation_shift_config')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('locationDesignationShiftService.delete error:', error);
      return false;
    }

    // Delete locally
    try {
      await db.locationDesignationShiftConfig.delete(id);
    } catch (err) {
      console.error('Dexie delete error for locationDesignationShiftConfig:', err);
    }

    return true;
  }
};

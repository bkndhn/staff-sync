import { supabase } from '../lib/supabase';
import { type Designation } from '../types';

export type { Designation };

const mapFromDb = (d: any): Designation => ({
    id: d.id,
    name: d.name,
    displayName: d.display_name,
    isActive: d.is_active ?? true,
    sortOrder: d.sort_order ?? 0,
    shiftStart: d.shift_start ?? undefined,
    shiftEnd: d.shift_end ?? undefined,
    graceLateMin: d.grace_late_min !== null && d.grace_late_min !== undefined ? Number(d.grace_late_min) : undefined,
    graceEarlyMin: d.grace_early_min !== null && d.grace_early_min !== undefined ? Number(d.grace_early_min) : undefined,
    minHoursFull: d.min_hours_full !== null && d.min_hours_full !== undefined ? Number(d.min_hours_full) : undefined,
    minHoursHalf: d.min_hours_half !== null && d.min_hours_half !== undefined ? Number(d.min_hours_half) : undefined,
    morningCutoff: d.morning_cutoff ?? undefined,
    earlyExitTime: d.early_exit_time ?? undefined,
    eveningVerificationTime: d.evening_verification_time ?? undefined,
    fullDayRequiresMorning: d.full_day_requires_morning ?? undefined,
    lateDeductionRate: d.late_deduction_rate !== null && d.late_deduction_rate !== undefined ? Number(d.late_deduction_rate) : undefined,
    earlyDeductionRate: d.early_deduction_rate !== null && d.early_deduction_rate !== undefined ? Number(d.early_deduction_rate) : undefined,
});

export const designationService = {
    async getDesignations(): Promise<Designation[]> {
        const { data, error } = await supabase
            .from('designations')
            .select('*')
            .eq('is_active', true)
            .order('sort_order')
            .order('display_name');

        if (error) {
            console.error('Error fetching designations:', error);
            return [];
        }

        return (data || []).map(mapFromDb);
    },

    async getAllDesignations(): Promise<Designation[]> {
        const { data, error } = await supabase
            .from('designations')
            .select('*')
            .order('sort_order')
            .order('display_name');

        if (error) {
            console.error('Error fetching all designations:', error);
            return [];
        }

        return (data || []).map(mapFromDb);
    },

    async addDesignation(displayName: string): Promise<Designation | null> {
        const name = displayName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const { data, error } = await supabase
            .from('designations')
            .insert([{ name, display_name: displayName, is_active: true }])
            .select()
            .single();

        if (error) {
            console.error('Error adding designation:', error);
            return null;
        }

        return mapFromDb(data);
    },

    async updateDesignation(id: string, displayName: string): Promise<Designation | null> {
        const { data: oldDesig } = await supabase.from('designations').select('display_name').eq('id', id).single();
        const oldDisplayName = oldDesig?.display_name;

        const name = displayName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const { data, error } = await supabase
            .from('designations')
            .update({ name, display_name: displayName, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating designation:', error);
            return null;
        }

        if (oldDisplayName && oldDisplayName !== displayName) {
            const { error: staffError } = await supabase
                .from('staff')
                .update({ designation: displayName })
                .eq('designation', oldDisplayName);
            if (staffError) console.error('Error updating staff designations:', staffError);
        }

        return mapFromDb(data);
    },

    async updateDesignationRules(id: string, rules: Partial<Omit<Designation, 'id' | 'name' | 'displayName' | 'isActive' | 'sortOrder'>>): Promise<Designation | null> {
        const payload = {
            shift_start: rules.shiftStart,
            shift_end: rules.shiftEnd,
            grace_late_min: rules.graceLateMin,
            grace_early_min: rules.graceEarlyMin,
            min_hours_full: rules.minHoursFull,
            min_hours_half: rules.minHoursHalf,
            morning_cutoff: rules.morningCutoff,
            early_exit_time: rules.earlyExitTime,
            evening_verification_time: rules.eveningVerificationTime,
            full_day_requires_morning: rules.fullDayRequiresMorning,
            late_deduction_rate: rules.lateDeductionRate,
            early_deduction_rate: rules.earlyDeductionRate,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('designations')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating designation rules:', error);
            return null;
        }

        return mapFromDb(data);
    },

    async deleteDesignation(id: string): Promise<boolean> {
        const { error } = await supabase
            .from('designations')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            console.error('Error deleting designation:', error);
            return false;
        }
        return true;
    },

    async restoreDesignation(id: string): Promise<boolean> {
        const { error } = await supabase
            .from('designations')
            .update({ is_active: true, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (error) {
            console.error('Error restoring designation:', error);
            return false;
        }
        return true;
    },
};

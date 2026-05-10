import { supabase } from '../lib/supabase';
import type { SalaryOverride } from '../types';

export const salaryOverrideService = {
    async getOverrides(month: number, year: number) {
        const { data, error } = await supabase
            .from('salary_manual_overrides')
            .select('*')
            .eq('month', month)
            .eq('year', year);

        if (error) {
            console.error('Error fetching salary overrides:', error);
            return [];
        }

        return data.map((override: any) => ({
            id: override.id,
            staffId: override.staff_id,
            month: override.month,
            year: override.year,
            basicOverride: override.basic_override,
            incentiveOverride: override.incentive_override,
            hraOverride: override.hra_override,
            mealAllowanceOverride: override.meal_allowance_override,
            sundayPenaltyOverride: override.sunday_penalty_override,
            salarySupplementsOverride: override.salary_supplements_override || {}
        })) as SalaryOverride[];
    },

    async upsertOverride(override: Partial<SalaryOverride> & { staffId: string; month: number; year: number }) {
        const dbOverride = {
            staff_id: override.staffId,
            month: override.month,
            year: override.year,
            basic_override: override.basicOverride,
            incentive_override: override.incentiveOverride,
            hra_override: override.hraOverride,
            meal_allowance_override: override.mealAllowanceOverride,
            sunday_penalty_override: override.sundayPenaltyOverride,
            salary_supplements_override: override.salarySupplementsOverride,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('salary_manual_overrides')
            .upsert(dbOverride, {
                onConflict: 'staff_id,month,year',
                ignoreDuplicates: false
            })
            .select()
            .single();

        if (error) {
            console.error('Error saving salary override:', error);
            throw error;
        }

        return data;
    }
};

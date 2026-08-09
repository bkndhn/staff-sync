import { dataApi } from '../lib/dataApi';
import { supabase } from '../lib/supabase';
import { appSettingsService } from './appSettingsService';

export interface PayrollCategoryDB {
  id: string;
  name: string;
  display_name: string;
  is_active: boolean | null;
  sort_order: number | null;
  isDeleted?: boolean; // local soft-delete flag (stored in display_name as prefix for now)
}

export interface PayrollCategory {
  id: string;
  name: string; // display name
  key: string;  // unique identifier
  isBuiltIn: boolean;
  isDeleted?: boolean;
}

export type SalaryCategory = PayrollCategory;

const BUILT_IN_IDS = ['basic', 'incentive', 'hra', 'meal_allowance'];

export const DEFAULT_BUILT_INS: PayrollCategory[] = [
  { id: 'basic', name: 'Basic Payroll', key: 'basicSalary', isBuiltIn: true },
  { id: 'incentive', name: 'Incentive', key: 'incentive', isBuiltIn: true },
  { id: 'hra', name: 'HRA', key: 'hra', isBuiltIn: true },
  { id: 'meal_allowance', name: 'Meal Allowance', key: 'mealAllowance', isBuiltIn: true },
];

const BUILT_IN_NAMES_KEY = 'salary_builtin_names';

// Get custom display names for built-in categories (from Supabase app_settings)
async function getBuiltInOverrides(): Promise<Record<string, string>> {
  try {
    const stored = await appSettingsService.getSetting(BUILT_IN_NAMES_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

async function saveBuiltInOverride(id: string, name: string) {
  const overrides = await getBuiltInOverrides();
  overrides[id] = name;
  await appSettingsService.setSetting(BUILT_IN_NAMES_KEY, JSON.stringify(overrides));
}

export const salaryCategoryService = {
  // Get all active categories (built-in + custom from Supabase)
  async getCategories(): Promise<SalaryCategory[]> {
    const builtInOverrides = await getBuiltInOverrides();

    // Get built-ins with any name overrides and deletion state
    const builtIns: PayrollCategory[] = DEFAULT_BUILT_INS.map(b => ({
      ...b,
      name: builtInOverrides[b.id] || b.name,
      isDeleted: builtInOverrides[`${b.id}_deleted`] === 'true',
    }));

    // Get custom from Supabase
    try {
      const { data, error } = await dataApi
        .from('salary_categories')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;

      const custom: PayrollCategory[] = (data || []).map((row: any) => ({
        id: row.id,
        name: row.display_name,
        key: row.name, // 'name' field stores the key
        isBuiltIn: false,
        isDeleted: !row.is_active,
      }));

      return [...builtIns, ...custom];
    } catch (err) {
      console.error('Error fetching salary categories from DB:', err);
      return builtIns;
    }
  },

  // Get categories synchronously (for components that can't use async)
  getCategoriesSync(): PayrollCategory[] {
    return DEFAULT_BUILT_INS;
  },

  // Update built-in category name (stored locally -> now in Supabase)
  async updateBuiltInName(id: string, name: string): Promise<void> {
    if (!BUILT_IN_IDS.includes(id)) return;
    await saveBuiltInOverride(id, name);
  },

  // Add a new custom category to Supabase
  async addCategory(displayName: string): Promise<SalaryCategory | null> {
    const key = displayName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    // Get current max sort_order
    const { data: existing } = await dataApi
      .from('salary_categories')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1);

    const maxOrder = existing?.[0]?.sort_order ?? 0;

    const { data, error } = await dataApi
      .from('salary_categories')
      .insert([{
        name: key,
        display_name: displayName,
        is_active: true,
        sort_order: maxOrder + 1,
      }])
      .select()
      .single();

    if (error) {
      console.error('Error adding salary category:', error);
      return null;
    }

    const cat: PayrollCategory = {
      id: data.id,
      name: data.display_name,
      key: data.name,
      isBuiltIn: false,
      isDeleted: false,
    };

    return cat;
  },

  // Update custom category name in Supabase
  async updateCategory(id: string, displayName: string): Promise<boolean> {
    // If it's a built-in, update in app_settings
    if (BUILT_IN_IDS.includes(id)) {
      await saveBuiltInOverride(id, displayName);
      return true;
    }

    const { error } = await dataApi
      .from('salary_categories')
      .update({ display_name: displayName })
      .eq('id', id);

    if (error) {
      console.error('Error updating salary category:', error);
      return false;
    }

    return true;
  },

  // Soft-delete (deactivate) a category (built-in or custom)
  async softDeleteCategory(id: string): Promise<boolean> {
    // For built-in categories, store deletion state in app_settings
    if (BUILT_IN_IDS.includes(id)) {
      const overrides = await getBuiltInOverrides();
      overrides[`${id}_deleted`] = 'true';
      await appSettingsService.setSetting(BUILT_IN_NAMES_KEY, JSON.stringify(overrides));
      return true;
    }

    const { error } = await dataApi
      .from('salary_categories')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('Error soft-deleting category:', error);
      return false;
    }

    return true;
  },

  // Restore a soft-deleted category
  async restoreCategory(id: string): Promise<boolean> {
    // For built-in categories, remove deletion state in app_settings
    if (BUILT_IN_IDS.includes(id)) {
      const overrides = await getBuiltInOverrides();
      delete overrides[`${id}_deleted`];
      await appSettingsService.setSetting(BUILT_IN_NAMES_KEY, JSON.stringify(overrides));
      return true;
    }

    const { error } = await dataApi
      .from('salary_categories')
      .update({ is_active: true })
      .eq('id', id);

    if (error) {
      console.error('Error restoring category:', error);
      return false;
    }

    return true;
  },
};

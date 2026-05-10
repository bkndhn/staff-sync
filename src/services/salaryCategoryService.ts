import { supabase } from '../lib/supabase';

export interface SalaryCategoryDB {
  id: string;
  name: string;
  display_name: string;
  is_active: boolean | null;
  sort_order: number | null;
  isDeleted?: boolean; // local soft-delete flag (stored in display_name as prefix for now)
}

export interface SalaryCategory {
  id: string;
  name: string; // display name
  key: string;  // unique identifier
  isBuiltIn: boolean;
  isDeleted?: boolean;
}

const BUILT_IN_IDS = ['basic', 'incentive', 'hra', 'meal_allowance'];

const DEFAULT_BUILT_INS: SalaryCategory[] = [
  { id: 'basic', name: 'Basic Salary', key: 'basicSalary', isBuiltIn: true },
  { id: 'incentive', name: 'Incentive', key: 'incentive', isBuiltIn: true },
  { id: 'hra', name: 'HRA', key: 'hra', isBuiltIn: true },
  { id: 'meal_allowance', name: 'Meal Allowance', key: 'mealAllowance', isBuiltIn: true },
];

const BUILT_IN_NAMES_KEY = 'salary_builtin_names';
const CUSTOM_CATEGORIES_KEY = 'salary_custom_categories';

// Get custom display names for built-in categories (stored in localStorage)
function getBuiltInOverrides(): Record<string, string> {
  try {
    const stored = localStorage.getItem(BUILT_IN_NAMES_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveBuiltInOverride(id: string, name: string) {
  const overrides = getBuiltInOverrides();
  overrides[id] = name;
  localStorage.setItem(BUILT_IN_NAMES_KEY, JSON.stringify(overrides));
}

export const salaryCategoryService = {
  // Get all active categories (built-in + custom from Supabase)
  async getCategories(): Promise<SalaryCategory[]> {
    const builtInOverrides = getBuiltInOverrides();

    // Get built-ins with any name overrides and deletion state
    const builtIns: SalaryCategory[] = DEFAULT_BUILT_INS.map(b => ({
      ...b,
      name: builtInOverrides[b.id] || b.name,
      isDeleted: builtInOverrides[`${b.id}_deleted`] === 'true',
    }));

    // Get custom from Supabase
    try {
      const { data, error } = await supabase
        .from('salary_categories')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;

      const custom: SalaryCategory[] = (data || []).map(row => ({
        id: row.id,
        name: row.display_name,
        key: row.name, // 'name' field stores the key
        isBuiltIn: false,
        isDeleted: !row.is_active,
      }));

      return [...builtIns, ...custom];
    } catch (err) {
      console.error('Error fetching salary categories from DB:', err);
      // Fallback to localStorage for custom categories
      const localCustom = getLocalCustomCategories();
      return [...builtIns, ...localCustom];
    }
  },

  // Get categories synchronously (for components that can't use async)
  getCategoriesSync(): SalaryCategory[] {
    const builtInOverrides = getBuiltInOverrides();
    const builtIns = DEFAULT_BUILT_INS.map(b => ({
      ...b,
      name: builtInOverrides[b.id] || b.name,
      isDeleted: builtInOverrides[`${b.id}_deleted`] === 'true',
    }));
    const localCustom = getLocalCustomCategories();
    return [...builtIns, ...localCustom];
  },

  // Update built-in category name (stored locally)
  updateBuiltInName(id: string, name: string): void {
    if (!BUILT_IN_IDS.includes(id)) return;
    saveBuiltInOverride(id, name);
  },

  // Add a new custom category to Supabase
  async addCategory(displayName: string): Promise<SalaryCategory | null> {
    const key = displayName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    // Get current max sort_order
    const { data: existing } = await supabase
      .from('salary_categories')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1);

    const maxOrder = existing?.[0]?.sort_order ?? 0;

    const { data, error } = await supabase
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
      // Fallback: save locally
      const local = addLocalCustomCategory(displayName);
      return local;
    }

    const cat: SalaryCategory = {
      id: data.id,
      name: data.display_name,
      key: data.name,
      isBuiltIn: false,
      isDeleted: false,
    };

    // Also sync to localStorage for sync access
    syncLocalCustom(cat);
    return cat;
  },

  // Update custom category name in Supabase
  async updateCategory(id: string, displayName: string): Promise<boolean> {
    // If it's a built-in, update locally
    if (BUILT_IN_IDS.includes(id)) {
      saveBuiltInOverride(id, displayName);
      return true;
    }

    const { error } = await supabase
      .from('salary_categories')
      .update({ display_name: displayName })
      .eq('id', id);

    if (error) {
      console.error('Error updating salary category:', error);
      return false;
    }

    // Update local cache
    updateLocalCustomName(id, displayName);
    return true;
  },

  // Soft-delete (deactivate) a category (built-in or custom)
  async softDeleteCategory(id: string): Promise<boolean> {
    // For built-in categories, store deletion state locally
    if (BUILT_IN_IDS.includes(id)) {
      const overrides = getBuiltInOverrides();
      overrides[`${id}_deleted`] = 'true';
      localStorage.setItem(BUILT_IN_NAMES_KEY, JSON.stringify(overrides));
      return true;
    }

    const { error } = await supabase
      .from('salary_categories')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('Error soft-deleting category:', error);
      return false;
    }

    // Update local cache
    updateLocalCustomDeleted(id, true);
    return true;
  },

  // Restore a soft-deleted category
  async restoreCategory(id: string): Promise<boolean> {
    // For built-in categories, remove deletion state locally
    if (BUILT_IN_IDS.includes(id)) {
      const overrides = getBuiltInOverrides();
      delete overrides[`${id}_deleted`];
      localStorage.setItem(BUILT_IN_NAMES_KEY, JSON.stringify(overrides));
      return true;
    }

    const { error } = await supabase
      .from('salary_categories')
      .update({ is_active: true })
      .eq('id', id);

    if (error) {
      console.error('Error restoring category:', error);
      return false;
    }

    updateLocalCustomDeleted(id, false);
    return true;
  },
};

// ===== Local storage helpers for offline fallback and sync =====

function getLocalCustomCategories(): SalaryCategory[] {
  try {
    const stored = localStorage.getItem(CUSTOM_CATEGORIES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function addLocalCustomCategory(displayName: string): SalaryCategory {
  const key = displayName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const id = `local_${Date.now()}`;
  const cat: SalaryCategory = { id, name: displayName, key, isBuiltIn: false, isDeleted: false };
  const all = getLocalCustomCategories();
  all.push(cat);
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(all));
  return cat;
}

function syncLocalCustom(cat: SalaryCategory) {
  const all = getLocalCustomCategories();
  const idx = all.findIndex(c => c.key === cat.key);
  if (idx !== -1) {
    all[idx] = cat;
  } else {
    all.push(cat);
  }
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(all));
}

function updateLocalCustomName(id: string, name: string) {
  const all = getLocalCustomCategories();
  const idx = all.findIndex(c => c.id === id);
  if (idx !== -1) { all[idx].name = name; }
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(all));
}

function updateLocalCustomDeleted(id: string, isDeleted: boolean) {
  const all = getLocalCustomCategories();
  const idx = all.findIndex(c => c.id === id);
  if (idx !== -1) { all[idx].isDeleted = isDeleted; }
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(all));
}

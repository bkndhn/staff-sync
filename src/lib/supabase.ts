// Re-export the correctly configured Supabase client from integrations
export { supabase } from '../integrations/supabase/client';

// Check if Supabase is properly configured
export const isSupabaseConfigured = true;

export interface DatabaseStaff {
  id: string;
  name: string;
  location: string;
  type: string;
  experience: string;
  basic_salary: number;
  incentive: number;
  hra: number;
  total_salary: number;
  joined_date: string;
  is_active: boolean;
  sunday_penalty: boolean;
  salary_calculation_days: number;
  salary_supplements: Record<string, number>;
  meal_allowance: number;
  display_order: number;
  contact_number?: string | null;
  address?: string | null;
  photo_url?: string | null;
  initial_salary?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DatabaseAttendance {
  id: string;
  staff_id: string;
  date: string;
  status: string;
  created_at: string | null;
  attendance_value: number;
  is_part_time?: boolean | null;
  is_sunday?: boolean | null;
  staff_name?: string | null;
  location?: string | null;
  shift?: string | null;
  salary?: number | null;
  salary_override?: boolean | null;
  arrival_time?: string | null;
  leaving_time?: string | null;
  is_uninformed?: boolean | null;
}

export interface DatabaseAdvanceDeduction {
  id: string;
  staff_id: string;
  month: number;
  year: number;
  old_advance: number;
  current_advance: number;
  deduction: number;
  new_advance: number;
  notes?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// Alias for backward compat
export type DatabaseAdvance = DatabaseAdvanceDeduction;

export interface DatabaseOldStaffRecord {
  id: string;
  original_staff_id: string;
  name: string;
  location: string;
  type: string;
  experience: string;
  basic_salary: number;
  incentive: number;
  hra: number;
  total_salary: number;
  joined_date: string;
  left_date: string;
  reason: string;
  total_advance_outstanding: number;
  last_advance_data?: any;
  contact_number?: string | null;
  address?: string | null;
  photo_url?: string | null;
  created_at: string | null;
}

export interface DatabaseSalaryHike {
  id: string;
  staff_id: string;
  hike_date: string;
  old_salary: number;
  new_salary: number;
  reason?: string | null;
  breakdown?: any;
  created_at?: string | null;
}

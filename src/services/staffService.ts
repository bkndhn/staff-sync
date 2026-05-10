import { supabase } from '../lib/supabase';
import { Staff } from '../types';
import type { DatabaseStaff } from '../lib/supabase';

export const staffService = {
  async getAll(): Promise<Staff[]> {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching staff:', error);
      throw error;
    }

    return data.map((d: any) => this.mapFromDatabase(d));
  },

  async create(staff: Omit<Staff, 'id'>): Promise<Staff> {
    // Get max display_order to set the new staff at the end
    const { data: maxData } = await supabase
      .from('staff')
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1);

    const maxOrder = maxData && maxData.length > 0 ? (maxData[0].display_order || 0) : 0;
    const dbStaff = {
      ...this.mapToDatabase(staff),
      display_order: maxOrder + 1
    };

    const { data, error } = await supabase
      .from('staff')
      .insert([dbStaff])
      .select()
      .single();

    if (error) {
      console.error('Error creating staff:', error);
      throw error;
    }

    return this.mapFromDatabase(data as any);
  },

  async update(id: string, updates: Partial<Staff>): Promise<Staff> {
    // Map camelCase properties to snake_case database column names
    const dbUpdates: Partial<Omit<DatabaseStaff, 'id' | 'created_at'>> = {
      updated_at: new Date().toISOString()
    };

    if (updates.name !== undefined) (dbUpdates as any).name = updates.name;
    if (updates.location !== undefined) (dbUpdates as any).location = updates.location;
    if (updates.floor !== undefined) (dbUpdates as any).floor = updates.floor;
    if (updates.designation !== undefined) (dbUpdates as any).designation = updates.designation;
    if (updates.type !== undefined) (dbUpdates as any).type = updates.type;
    if (updates.experience !== undefined) (dbUpdates as any).experience = updates.experience;
    if (updates.basicSalary !== undefined) (dbUpdates as any).basic_salary = updates.basicSalary;
    if (updates.incentive !== undefined) (dbUpdates as any).incentive = updates.incentive;
    if (updates.hra !== undefined) (dbUpdates as any).hra = updates.hra;
    if (updates.totalSalary !== undefined) (dbUpdates as any).total_salary = updates.totalSalary;
    if (updates.joinedDate !== undefined) (dbUpdates as any).joined_date = updates.joinedDate;
    if (updates.isActive !== undefined) (dbUpdates as any).is_active = updates.isActive;
    if (updates.sundayPenalty !== undefined) (dbUpdates as any).sunday_penalty = updates.sundayPenalty;
    if (updates.salaryCalculationDays !== undefined) (dbUpdates as any).salary_calculation_days = updates.salaryCalculationDays;
    if (updates.displayOrder !== undefined) (dbUpdates as any).display_order = updates.displayOrder;
    if (updates.salarySupplements !== undefined) (dbUpdates as any).salary_supplements = updates.salarySupplements;
    if (updates.mealAllowance !== undefined) (dbUpdates as any).meal_allowance = updates.mealAllowance;
    if (updates.mealAllowanceThreshold !== undefined) (dbUpdates as any).meal_allowance_threshold = updates.mealAllowanceThreshold;
    if (updates.staffAccommodation !== undefined) (dbUpdates as any).staff_accommodation = updates.staffAccommodation;
    if (updates.allowanceCalcModes !== undefined) (dbUpdates as any).allowance_calc_modes = updates.allowanceCalcModes;
    if (updates.contactNumber !== undefined) (dbUpdates as any).contact_number = updates.contactNumber;
    if (updates.address !== undefined) (dbUpdates as any).address = updates.address;
    if (updates.photo !== undefined) (dbUpdates as any).photo_url = updates.photo;
    if (updates.bankAccountNumber !== undefined) (dbUpdates as any).bank_account_number = updates.bankAccountNumber;
    if (updates.ifscCode !== undefined) (dbUpdates as any).ifsc_code = updates.ifscCode;
    if (updates.bankName !== undefined) (dbUpdates as any).bank_name = updates.bankName;
    if (updates.paymentMode !== undefined) (dbUpdates as any).payment_mode = updates.paymentMode;
    if (updates.nextHikeDate !== undefined) (dbUpdates as any).next_hike_date = updates.nextHikeDate;
    if (updates.hikeIntervalMonths !== undefined) (dbUpdates as any).hike_interval_months = updates.hikeIntervalMonths;
    if (updates.statutoryDeductions !== undefined) (dbUpdates as any).statutory_deductions = updates.statutoryDeductions;
    if ((updates as any).shiftWindow !== undefined) (dbUpdates as any).shift_window = (updates as any).shiftWindow;

    const { data, error } = await supabase
      .from('staff')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating staff:', error);
      throw error;
    }

    return this.mapFromDatabase(data as any);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('staff')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      console.error('Error deleting staff:', error);
      throw error;
    }
  },

  async permanentDelete(id: string): Promise<void> {
    // Hard delete - permanently removes staff record from database
    const { error } = await supabase
      .from('staff')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error permanently deleting staff:', error);
      throw error;
    }
  },

  // Update staff order - batch update display_order for all staff
  async updateStaffOrder(staffIds: string[]): Promise<void> {
    try {
      // Update each staff member's display_order based on their position in the array
      const updates = staffIds.map((id, index) => ({
        id,
        display_order: index + 1,
        updated_at: new Date().toISOString()
      }));

      // Use upsert to update all records
      for (const update of updates) {
        const { error } = await supabase
          .from('staff')
          .update({ display_order: update.display_order, updated_at: update.updated_at })
          .eq('id', update.id);

        if (error) {
          console.error('Error updating staff order:', error);
          throw error;
        }
      }
    } catch (error) {
      console.error('Error in updateStaffOrder:', error);
      throw error;
    }
  },

  mapFromDatabase(dbStaff: any): Staff {
    return {
      id: dbStaff.id,
      name: dbStaff.name,
      location: dbStaff.location,
      floor: dbStaff.floor || undefined,
      designation: dbStaff.designation || undefined,
      type: dbStaff.type as Staff['type'],
      experience: dbStaff.experience,
      basicSalary: dbStaff.basic_salary,
      incentive: dbStaff.incentive,
      hra: dbStaff.hra,
      totalSalary: dbStaff.total_salary,
      joinedDate: dbStaff.joined_date,
      isActive: dbStaff.is_active,
      sundayPenalty: dbStaff.sunday_penalty ?? true,
      salaryCalculationDays: dbStaff.salary_calculation_days || 30,
      salarySupplements: dbStaff.salary_supplements || {},
      mealAllowance: dbStaff.meal_allowance || 0,
      mealAllowanceThreshold: dbStaff.meal_allowance_threshold || 0,
      staffAccommodation: dbStaff.staff_accommodation || '',
      allowanceCalcModes: dbStaff.allowance_calc_modes || {},
      displayOrder: dbStaff.display_order,
      contactNumber: dbStaff.contact_number ?? undefined,
      address: dbStaff.address ?? undefined,
      photo: dbStaff.photo_url ?? undefined,
      bankAccountNumber: dbStaff.bank_account_number || '',
      ifscCode: dbStaff.ifsc_code || '',
      bankName: dbStaff.bank_name || '',
      paymentMode: dbStaff.payment_mode || 'cash',
      nextHikeDate: dbStaff.next_hike_date || undefined,
      hikeIntervalMonths: dbStaff.hike_interval_months || undefined,
      statutoryDeductions: dbStaff.statutory_deductions || {},
      shiftWindow: dbStaff.shift_window || undefined,
      faceMatchThreshold: dbStaff.face_match_threshold ?? undefined,
    };
  },

  mapToDatabase(staff: Omit<Staff, 'id'>): Omit<DatabaseStaff, 'id' | 'created_at' | 'updated_at'> {
    return {
      name: staff.name,
      location: staff.location,
      floor: (staff as any).floor || null,
      designation: (staff as any).designation || null,
      type: staff.type,
      experience: staff.experience,
      basic_salary: staff.basicSalary,
      incentive: staff.incentive,
      hra: staff.hra,
      total_salary: staff.totalSalary,
      joined_date: staff.joinedDate,
      is_active: staff.isActive,
      sunday_penalty: staff.sundayPenalty ?? true,
      salary_calculation_days: staff.salaryCalculationDays || 30,
      salary_supplements: staff.salarySupplements || {},
      meal_allowance: staff.mealAllowance || 0,
      meal_allowance_threshold: staff.mealAllowanceThreshold || 0,
      staff_accommodation: staff.staffAccommodation || '',
      allowance_calc_modes: staff.allowanceCalcModes || {},
      display_order: staff.displayOrder || 0,
      contact_number: staff.contactNumber,
      address: staff.address,
      photo_url: staff.photo,
      bank_account_number: staff.bankAccountNumber || null,
      ifsc_code: staff.ifscCode || null,
      bank_name: staff.bankName || null,
      payment_mode: staff.paymentMode || 'cash',
      next_hike_date: staff.nextHikeDate || null,
      hike_interval_months: staff.hikeIntervalMonths || null,
      statutory_deductions: staff.statutoryDeductions || {},
      shift_window: (staff as any).shiftWindow ?? null,
    } as any;
  }
};
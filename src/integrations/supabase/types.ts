export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      advance_entries: {
        Row: {
          amount: number
          created_at: string | null
          entry_date: string
          id: string
          month: number
          purpose: string | null
          staff_id: string
          updated_at: string | null
          year: number
        }
        Insert: {
          amount?: number
          created_at?: string | null
          entry_date: string
          id?: string
          month: number
          purpose?: string | null
          staff_id: string
          updated_at?: string | null
          year: number
        }
        Update: {
          amount?: number
          created_at?: string | null
          entry_date?: string
          id?: string
          month?: number
          purpose?: string | null
          staff_id?: string
          updated_at?: string | null
          year?: number
        }
        Relationships: []
      }
      advances: {
        Row: {
          basic_override: number | null
          created_at: string | null
          current_advance: number
          deduction: number
          hra_override: number | null
          id: string
          incentive_override: number | null
          month: number
          new_advance: number
          notes: string | null
          old_advance: number
          staff_id: string
          sunday_penalty_override: number | null
          updated_at: string | null
          year: number
        }
        Insert: {
          basic_override?: number | null
          created_at?: string | null
          current_advance?: number
          deduction?: number
          hra_override?: number | null
          id?: string
          incentive_override?: number | null
          month: number
          new_advance?: number
          notes?: string | null
          old_advance?: number
          staff_id: string
          sunday_penalty_override?: number | null
          updated_at?: string | null
          year: number
        }
        Update: {
          basic_override?: number | null
          created_at?: string | null
          current_advance?: number
          deduction?: number
          hra_override?: number | null
          id?: string
          incentive_override?: number | null
          month?: number
          new_advance?: number
          notes?: string | null
          old_advance?: number
          staff_id?: string
          sunday_penalty_override?: number | null
          updated_at?: string | null
          year?: number
        }
        Relationships: []
      }
      app_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          is_valid: boolean
          role: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          is_valid?: boolean
          role: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          is_valid?: boolean
          role?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      app_users: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean | null
          last_login: string | null
          location: string | null
          location_id: string | null
          password_hash: string
          role: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          location?: string | null
          location_id?: string | null
          password_hash: string
          role: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          location?: string | null
          location_id?: string | null
          password_hash?: string
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      attendance: {
        Row: {
          arrival_time: string | null
          attendance_value: number
          created_at: string | null
          date: string
          id: string
          is_part_time: boolean | null
          is_sunday: boolean | null
          is_uninformed: boolean | null
          leaving_time: string | null
          location: string | null
          salary: number | null
          salary_override: boolean | null
          settlement_location: string | null
          shift: string | null
          staff_id: string
          staff_name: string | null
          status: string
        }
        Insert: {
          arrival_time?: string | null
          attendance_value: number
          created_at?: string | null
          date: string
          id?: string
          is_part_time?: boolean | null
          is_sunday?: boolean | null
          is_uninformed?: boolean | null
          leaving_time?: string | null
          location?: string | null
          salary?: number | null
          salary_override?: boolean | null
          settlement_location?: string | null
          shift?: string | null
          staff_id: string
          staff_name?: string | null
          status: string
        }
        Update: {
          arrival_time?: string | null
          attendance_value?: number
          created_at?: string | null
          date?: string
          id?: string
          is_part_time?: boolean | null
          is_sunday?: boolean | null
          is_uninformed?: boolean | null
          leaving_time?: string | null
          location?: string | null
          salary?: number | null
          salary_override?: boolean | null
          settlement_location?: string | null
          shift?: string | null
          staff_id?: string
          staff_name?: string | null
          status?: string
        }
        Relationships: []
      }
      designations: {
        Row: {
          created_at: string | null
          display_name: string
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      face_embeddings: {
        Row: {
          angle_label: string
          captured_by: string | null
          created_at: string
          descriptor: Json
          descriptor_dim: number
          id: string
          image_path: string | null
          is_approved: boolean
          notes: string | null
          quality_score: number | null
          staff_id: string
          staff_name: string | null
          updated_at: string
        }
        Insert: {
          angle_label?: string
          captured_by?: string | null
          created_at?: string
          descriptor: Json
          descriptor_dim?: number
          id?: string
          image_path?: string | null
          is_approved?: boolean
          notes?: string | null
          quality_score?: number | null
          staff_id: string
          staff_name?: string | null
          updated_at?: string
        }
        Update: {
          angle_label?: string
          captured_by?: string | null
          created_at?: string
          descriptor?: Json
          descriptor_dim?: number
          id?: string
          image_path?: string | null
          is_approved?: boolean
          notes?: string | null
          quality_score?: number | null
          staff_id?: string
          staff_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      face_registration_logs: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          embedding_id: string | null
          id: string
          metadata: Json | null
          reason: string | null
          staff_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          embedding_id?: string | null
          id?: string
          metadata?: Json | null
          reason?: string | null
          staff_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          embedding_id?: string | null
          id?: string
          metadata?: Json | null
          reason?: string | null
          staff_id?: string
        }
        Relationships: []
      }
      floors: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          location_name: string
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          location_name: string
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          location_name?: string
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          created_at: string | null
          id: string
          leave_date: string
          leave_end_date: string | null
          leave_type: string
          location: string
          manager_comment: string | null
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string
          staff_name: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          leave_date: string
          leave_end_date?: string | null
          leave_type?: string
          location: string
          manager_comment?: string | null
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id: string
          staff_name: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          leave_date?: string
          leave_end_date?: string | null
          leave_type?: string
          location?: string
          manager_comment?: string | null
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string
          staff_name?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      location_shift_config: {
        Row: {
          allow_manager_override: boolean
          created_at: string
          early_exit_time: string
          full_day_requires_morning: boolean
          grace_early_min: number
          grace_late_min: number
          id: string
          location_name: string
          min_hours_full: number
          min_hours_half: number
          morning_cutoff: string
          shift_end: string
          shift_start: string
          updated_at: string
        }
        Insert: {
          allow_manager_override?: boolean
          created_at?: string
          early_exit_time?: string
          full_day_requires_morning?: boolean
          grace_early_min?: number
          grace_late_min?: number
          id?: string
          location_name: string
          min_hours_full?: number
          min_hours_half?: number
          morning_cutoff?: string
          shift_end?: string
          shift_start?: string
          updated_at?: string
        }
        Update: {
          allow_manager_override?: boolean
          created_at?: string
          early_exit_time?: string
          full_day_requires_morning?: boolean
          grace_early_min?: number
          grace_late_min?: number
          id?: string
          location_name?: string
          min_hours_full?: number
          min_hours_half?: number
          morning_cutoff?: string
          shift_end?: string
          shift_start?: string
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          created_at: string | null
          display_name: string
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      old_staff_records: {
        Row: {
          address: string | null
          basic_salary: number
          contact_number: string | null
          created_at: string | null
          experience: string
          hra: number
          id: string
          incentive: number
          joined_date: string
          last_advance_data: Json | null
          left_date: string
          location: string
          name: string
          original_staff_id: string
          photo_url: string | null
          reason: string
          total_advance_outstanding: number
          total_salary: number
          type: string
        }
        Insert: {
          address?: string | null
          basic_salary: number
          contact_number?: string | null
          created_at?: string | null
          experience: string
          hra: number
          id?: string
          incentive: number
          joined_date: string
          last_advance_data?: Json | null
          left_date: string
          location: string
          name: string
          original_staff_id: string
          photo_url?: string | null
          reason: string
          total_advance_outstanding?: number
          total_salary: number
          type: string
        }
        Update: {
          address?: string | null
          basic_salary?: number
          contact_number?: string | null
          created_at?: string | null
          experience?: string
          hra?: number
          id?: string
          incentive?: number
          joined_date?: string
          last_advance_data?: Json | null
          left_date?: string
          location?: string
          name?: string
          original_staff_id?: string
          photo_url?: string | null
          reason?: string
          total_advance_outstanding?: number
          total_salary?: number
          type?: string
        }
        Relationships: []
      }
      part_time_advance_tracking: {
        Row: {
          adjustment: number | null
          advance_given: number | null
          closing_balance: number | null
          created_at: string
          earnings: number | null
          id: string
          location: string
          month: number
          notes: string | null
          opening_balance: number | null
          pending_salary: number | null
          staff_name: string
          updated_at: string
          week_number: number
          week_start_date: string
          year: number
        }
        Insert: {
          adjustment?: number | null
          advance_given?: number | null
          closing_balance?: number | null
          created_at?: string
          earnings?: number | null
          id?: string
          location: string
          month: number
          notes?: string | null
          opening_balance?: number | null
          pending_salary?: number | null
          staff_name: string
          updated_at?: string
          week_number: number
          week_start_date: string
          year: number
        }
        Update: {
          adjustment?: number | null
          advance_given?: number | null
          closing_balance?: number | null
          created_at?: string
          earnings?: number | null
          id?: string
          location?: string
          month?: number
          notes?: string | null
          opening_balance?: number | null
          pending_salary?: number | null
          staff_name?: string
          updated_at?: string
          week_number?: number
          week_start_date?: string
          year?: number
        }
        Relationships: []
      }
      part_time_settlements: {
        Row: {
          created_at: string
          id: string
          is_settled: boolean | null
          location: string
          settled_at: string | null
          settled_by: string | null
          settlement_key: string
          staff_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_settled?: boolean | null
          location: string
          settled_at?: string | null
          settled_by?: string | null
          settlement_key: string
          staff_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_settled?: boolean | null
          location?: string
          settled_at?: string | null
          settled_by?: string | null
          settlement_key?: string
          staff_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      punch_events: {
        Row: {
          created_at: string
          date: string
          device_label: string | null
          event_time: string
          id: string
          kind: string
          liveness_score: number | null
          location: string | null
          match_distance: number | null
          source: string
          staff_id: string
          staff_name: string | null
        }
        Insert: {
          created_at?: string
          date: string
          device_label?: string | null
          event_time: string
          id?: string
          kind: string
          liveness_score?: number | null
          location?: string | null
          match_distance?: number | null
          source?: string
          staff_id: string
          staff_name?: string | null
        }
        Update: {
          created_at?: string
          date?: string
          device_label?: string | null
          event_time?: string
          id?: string
          kind?: string
          liveness_score?: number | null
          location?: string | null
          match_distance?: number | null
          source?: string
          staff_id?: string
          staff_name?: string | null
        }
        Relationships: []
      }
      salary_categories: {
        Row: {
          created_at: string | null
          display_name: string
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      salary_hikes: {
        Row: {
          breakdown: Json | null
          created_at: string | null
          hike_date: string
          id: string
          new_salary: number
          old_salary: number
          reason: string | null
          staff_id: string
        }
        Insert: {
          breakdown?: Json | null
          created_at?: string | null
          hike_date: string
          id?: string
          new_salary: number
          old_salary: number
          reason?: string | null
          staff_id: string
        }
        Update: {
          breakdown?: Json | null
          created_at?: string | null
          hike_date?: string
          id?: string
          new_salary?: number
          old_salary?: number
          reason?: string | null
          staff_id?: string
        }
        Relationships: []
      }
      salary_manual_overrides: {
        Row: {
          basic_override: number | null
          created_at: string
          hra_override: number | null
          id: string
          incentive_override: number | null
          meal_allowance_override: number | null
          month: number
          salary_supplements_override: Json | null
          staff_id: string | null
          sunday_penalty_override: number | null
          updated_at: string
          year: number
        }
        Insert: {
          basic_override?: number | null
          created_at?: string
          hra_override?: number | null
          id?: string
          incentive_override?: number | null
          meal_allowance_override?: number | null
          month: number
          salary_supplements_override?: Json | null
          staff_id?: string | null
          sunday_penalty_override?: number | null
          updated_at?: string
          year: number
        }
        Update: {
          basic_override?: number | null
          created_at?: string
          hra_override?: number | null
          id?: string
          incentive_override?: number | null
          meal_allowance_override?: number | null
          month?: number
          salary_supplements_override?: Json | null
          staff_id?: string | null
          sunday_penalty_override?: number | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "salary_manual_overrides_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          address: string | null
          allowance_calc_modes: Json | null
          bank_account_number: string | null
          bank_name: string | null
          basic_salary: number
          contact_number: string | null
          created_at: string | null
          designation: string | null
          display_order: number | null
          esi_number: string | null
          experience: string
          floor: string | null
          hike_interval_months: number | null
          hra: number
          id: string
          ifsc_code: string | null
          incentive: number
          initial_salary: number | null
          is_active: boolean
          joined_date: string
          location: string
          meal_allowance: number | null
          meal_allowance_threshold: number | null
          name: string
          next_hike_date: string | null
          payment_mode: string | null
          pf_number: string | null
          photo_url: string | null
          salary_calculation_days: number | null
          salary_supplements: Json | null
          shift_window: Json | null
          staff_accommodation: string | null
          statutory_deductions: Json | null
          sunday_penalty: boolean | null
          total_salary: number
          type: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          allowance_calc_modes?: Json | null
          bank_account_number?: string | null
          bank_name?: string | null
          basic_salary?: number
          contact_number?: string | null
          created_at?: string | null
          designation?: string | null
          display_order?: number | null
          esi_number?: string | null
          experience: string
          floor?: string | null
          hike_interval_months?: number | null
          hra?: number
          id?: string
          ifsc_code?: string | null
          incentive?: number
          initial_salary?: number | null
          is_active?: boolean
          joined_date: string
          location: string
          meal_allowance?: number | null
          meal_allowance_threshold?: number | null
          name: string
          next_hike_date?: string | null
          payment_mode?: string | null
          pf_number?: string | null
          photo_url?: string | null
          salary_calculation_days?: number | null
          salary_supplements?: Json | null
          shift_window?: Json | null
          staff_accommodation?: string | null
          statutory_deductions?: Json | null
          sunday_penalty?: boolean | null
          total_salary: number
          type: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          allowance_calc_modes?: Json | null
          bank_account_number?: string | null
          bank_name?: string | null
          basic_salary?: number
          contact_number?: string | null
          created_at?: string | null
          designation?: string | null
          display_order?: number | null
          esi_number?: string | null
          experience?: string
          floor?: string | null
          hike_interval_months?: number | null
          hra?: number
          id?: string
          ifsc_code?: string | null
          incentive?: number
          initial_salary?: number | null
          is_active?: boolean
          joined_date?: string
          location?: string
          meal_allowance?: number | null
          meal_allowance_threshold?: number | null
          name?: string
          next_hike_date?: string | null
          payment_mode?: string | null
          pf_number?: string | null
          photo_url?: string | null
          salary_calculation_days?: number | null
          salary_supplements?: Json | null
          shift_window?: Json | null
          staff_accommodation?: string | null
          statutory_deductions?: Json | null
          sunday_penalty?: boolean | null
          total_salary?: number
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          created_at: string | null
          email: string
          full_name: string
          id: string
          location: string | null
          role: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name: string
          id: string
          location?: string | null
          role: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          location?: string | null
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      app_users_public: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          last_login: string | null
          location: string | null
          location_id: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          last_login?: string | null
          location?: string | null
          location_id?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          last_login?: string | null
          location?: string | null
          location_id?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

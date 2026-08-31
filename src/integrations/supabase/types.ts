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
          deduct_periods: number | null
          entry_date: string
          id: string
          month: number
          purpose: string | null
          staff_id: string
          start_deduct_month: number | null
          start_deduct_year: number | null
          tenant_id: string | null
          total_deducted: number | null
          updated_at: string | null
          year: number
        }
        Insert: {
          amount?: number
          created_at?: string | null
          deduct_periods?: number | null
          entry_date: string
          id?: string
          month: number
          purpose?: string | null
          staff_id: string
          start_deduct_month?: number | null
          start_deduct_year?: number | null
          tenant_id?: string | null
          total_deducted?: number | null
          updated_at?: string | null
          year: number
        }
        Update: {
          amount?: number
          created_at?: string | null
          deduct_periods?: number | null
          entry_date?: string
          id?: string
          month?: number
          purpose?: string | null
          staff_id?: string
          start_deduct_month?: number | null
          start_deduct_year?: number | null
          tenant_id?: string | null
          total_deducted?: number | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "advance_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "advances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_insights: {
        Row: {
          created_at: string
          id: string
          insight_text: string
          is_active: boolean
          severity: string | null
          staff_id: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          insight_text: string
          is_active?: boolean
          severity?: string | null
          staff_id?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          insight_text?: string
          is_active?: boolean
          severity?: string | null
          staff_id?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "app_users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_insights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          priority: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          priority?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          priority?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          statutory_login_details: Json | null
          tenant_id: string | null
          updated_at: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          statutory_login_details?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          statutory_login_details?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      app_users: {
        Row: {
          auth_id: string | null
          created_at: string | null
          email: string
          floor: string | null
          floor_id: string | null
          full_name: string
          id: string
          is_active: boolean | null
          last_login: string | null
          location: string | null
          location_id: string | null
          password_hash: string
          role: string
          super_admin_role: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          auth_id?: string | null
          created_at?: string | null
          email: string
          floor?: string | null
          floor_id?: string | null
          full_name: string
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          location?: string | null
          location_id?: string | null
          password_hash: string
          role: string
          super_admin_role?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          auth_id?: string | null
          created_at?: string | null
          email?: string
          floor?: string | null
          floor_id?: string | null
          full_name?: string
          id?: string
          is_active?: boolean | null
          last_login?: string | null
          location?: string | null
          location_id?: string | null
          password_hash?: string
          role?: string
          super_admin_role?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          applied_rule_details: Json | null
          applied_rule_type: string | null
          arrival_time: string | null
          attendance_value: number
          break_minutes: number
          break_time_in: string | null
          break_time_out: string | null
          created_at: string | null
          date: string
          floor: string | null
          id: string
          is_part_time: boolean | null
          is_sunday: boolean | null
          is_uninformed: boolean | null
          leaving_time: string | null
          location: string | null
          net_working_minutes: number | null
          salary: number | null
          salary_override: boolean | null
          settlement_location: string | null
          shift: string | null
          staff_id: string
          staff_name: string | null
          status: string
          tenant_id: string | null
        }
        Insert: {
          applied_rule_details?: Json | null
          applied_rule_type?: string | null
          arrival_time?: string | null
          attendance_value: number
          break_minutes?: number
          break_time_in?: string | null
          break_time_out?: string | null
          created_at?: string | null
          date: string
          floor?: string | null
          id?: string
          is_part_time?: boolean | null
          is_sunday?: boolean | null
          is_uninformed?: boolean | null
          leaving_time?: string | null
          location?: string | null
          net_working_minutes?: number | null
          salary?: number | null
          salary_override?: boolean | null
          settlement_location?: string | null
          shift?: string | null
          staff_id: string
          staff_name?: string | null
          status: string
          tenant_id?: string | null
        }
        Update: {
          applied_rule_details?: Json | null
          applied_rule_type?: string | null
          arrival_time?: string | null
          attendance_value?: number
          break_minutes?: number
          break_time_in?: string | null
          break_time_out?: string | null
          created_at?: string | null
          date?: string
          floor?: string | null
          id?: string
          is_part_time?: boolean | null
          is_sunday?: boolean | null
          is_uninformed?: boolean | null
          leaving_time?: string | null
          location?: string | null
          net_working_minutes?: number | null
          salary?: number | null
          salary_override?: boolean | null
          settlement_location?: string | null
          shift?: string | null
          staff_id?: string
          staff_name?: string | null
          status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          changes: Json | null
          details: string
          id: string
          metadata: Json
          performed_by: string
          staff_id: string | null
          staff_name: string | null
          tenant_id: string
          timestamp: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          changes?: Json | null
          details: string
          id: string
          metadata?: Json
          performed_by: string
          staff_id?: string | null
          staff_name?: string | null
          tenant_id: string
          timestamp?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          changes?: Json | null
          details?: string
          id?: string
          metadata?: Json
          performed_by?: string
          staff_id?: string | null
          staff_name?: string | null
          tenant_id?: string
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      break_events: {
        Row: {
          break_type_code: string | null
          break_type_id: string | null
          created_at: string
          created_by: string | null
          date: string
          device_label: string | null
          duration_minutes: number | null
          end_time: string | null
          id: string
          is_violation: boolean
          location: string | null
          notes: string | null
          source: string
          staff_id: string
          staff_name: string | null
          start_time: string
          tenant_id: string | null
          updated_at: string
          violation_reason: string | null
        }
        Insert: {
          break_type_code?: string | null
          break_type_id?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          device_label?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          is_violation?: boolean
          location?: string | null
          notes?: string | null
          source?: string
          staff_id: string
          staff_name?: string | null
          start_time: string
          tenant_id?: string | null
          updated_at?: string
          violation_reason?: string | null
        }
        Update: {
          break_type_code?: string | null
          break_type_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          device_label?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          is_violation?: boolean
          location?: string | null
          notes?: string | null
          source?: string
          staff_id?: string
          staff_name?: string | null
          start_time?: string
          tenant_id?: string | null
          updated_at?: string
          violation_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "break_events_break_type_id_fkey"
            columns: ["break_type_id"]
            isOneToOne: false
            referencedRelation: "break_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      break_policies: {
        Row: {
          break_type_id: string | null
          created_at: string
          deduct_from_hours: boolean
          designation_id: string | null
          grace_minutes: number
          id: string
          location: string | null
          max_minutes_per_break: number
          max_per_day: number
          max_total_minutes_per_day: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          break_type_id?: string | null
          created_at?: string
          deduct_from_hours?: boolean
          designation_id?: string | null
          grace_minutes?: number
          id?: string
          location?: string | null
          max_minutes_per_break?: number
          max_per_day?: number
          max_total_minutes_per_day?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          break_type_id?: string | null
          created_at?: string
          deduct_from_hours?: boolean
          designation_id?: string | null
          grace_minutes?: number
          id?: string
          location?: string | null
          max_minutes_per_break?: number
          max_per_day?: number
          max_total_minutes_per_day?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "break_policies_break_type_id_fkey"
            columns: ["break_type_id"]
            isOneToOne: false
            referencedRelation: "break_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "break_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      break_types: {
        Row: {
          code: string
          created_at: string
          default_minutes: number
          id: string
          is_active: boolean
          is_paid: boolean
          max_minutes: number
          name: string
          sort_order: number
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_minutes?: number
          id?: string
          is_active?: boolean
          is_paid?: boolean
          max_minutes?: number
          name: string
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_minutes?: number
          id?: string
          is_active?: boolean
          is_paid?: boolean
          max_minutes?: number
          name?: string
          sort_order?: number
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "break_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      designations: {
        Row: {
          created_at: string | null
          display_name: string
          early_deduction_rate: number | null
          early_exit_time: string | null
          evening_verification_time: string | null
          full_day_requires_morning: boolean | null
          grace_early_min: number | null
          grace_late_min: number | null
          id: string
          is_active: boolean | null
          late_deduction_rate: number | null
          min_hours_full: number | null
          min_hours_half: number | null
          morning_cutoff: string | null
          name: string
          shift_end: string | null
          shift_start: string | null
          sort_order: number | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          early_deduction_rate?: number | null
          early_exit_time?: string | null
          evening_verification_time?: string | null
          full_day_requires_morning?: boolean | null
          grace_early_min?: number | null
          grace_late_min?: number | null
          id?: string
          is_active?: boolean | null
          late_deduction_rate?: number | null
          min_hours_full?: number | null
          min_hours_half?: number | null
          morning_cutoff?: string | null
          name: string
          shift_end?: string | null
          shift_start?: string | null
          sort_order?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          early_deduction_rate?: number | null
          early_exit_time?: string | null
          evening_verification_time?: string | null
          full_day_requires_morning?: boolean | null
          grace_early_min?: number | null
          grace_late_min?: number | null
          id?: string
          is_active?: boolean | null
          late_deduction_rate?: number | null
          min_hours_full?: number | null
          min_hours_half?: number | null
          morning_cutoff?: string | null
          name?: string
          shift_end?: string | null
          shift_start?: string | null
          sort_order?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "designations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      device_status: {
        Row: {
          created_at: string
          device_id: string
          device_name: string | null
          id: string
          ip_address: string | null
          last_seen_at: string
          location: string | null
          status: string
          tenant_id: string | null
          total_punches_today: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_id: string
          device_name?: string | null
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          location?: string | null
          status?: string
          tenant_id?: string | null
          total_punches_today?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_id?: string
          device_name?: string | null
          id?: string
          ip_address?: string | null
          last_seen_at?: string
          location?: string | null
          status?: string
          tenant_id?: string | null
          total_punches_today?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          alert_sent_at: string | null
          browser_info: Json | null
          component: string
          fingerprint: string | null
          id: string
          message: string
          severity: string
          stack_trace: string | null
          tenant_id: string
          timestamp: string
          url: string | null
          user_agent: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          alert_sent_at?: string | null
          browser_info?: Json | null
          component: string
          fingerprint?: string | null
          id?: string
          message: string
          severity?: string
          stack_trace?: string | null
          tenant_id: string
          timestamp?: string
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          alert_sent_at?: string | null
          browser_info?: Json | null
          component?: string
          fingerprint?: string | null
          id?: string
          message?: string
          severity?: string
          stack_trace?: string | null
          tenant_id?: string
          timestamp?: string
          url?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "face_embeddings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "face_registration_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      floors: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          location_name: string
          name: string
          sort_order: number | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          location_name: string
          name: string
          sort_order?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          location_name?: string
          name?: string
          sort_order?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "floors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approval_history: Json | null
          created_at: string | null
          current_approval_level: number | null
          id: string
          leave_date: string
          leave_end_date: string | null
          leave_type: string
          location: string
          manager_comment: string | null
          reason: string
          required_approval_levels: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string
          staff_name: string
          status: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          approval_history?: Json | null
          created_at?: string | null
          current_approval_level?: number | null
          id?: string
          leave_date: string
          leave_end_date?: string | null
          leave_type?: string
          location: string
          manager_comment?: string | null
          reason: string
          required_approval_levels?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id: string
          staff_name: string
          status?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          approval_history?: Json | null
          created_at?: string | null
          current_approval_level?: number | null
          id?: string
          leave_date?: string
          leave_end_date?: string | null
          leave_type?: string
          location?: string
          manager_comment?: string | null
          reason?: string
          required_approval_levels?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string
          staff_name?: string
          status?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_requests: {
        Row: {
          advance_entry_id: string | null
          amount: number
          approval_history: Json
          approved_at: string | null
          created_at: string
          current_approval_level: number
          emi_months: number
          floor: string | null
          id: string
          location: string | null
          reason: string
          rejection_reason: string | null
          required_approval_levels: number
          staff_id: string
          staff_name: string | null
          start_month: number
          start_year: number
          status: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          advance_entry_id?: string | null
          amount: number
          approval_history?: Json
          approved_at?: string | null
          created_at?: string
          current_approval_level?: number
          emi_months?: number
          floor?: string | null
          id?: string
          location?: string | null
          reason: string
          rejection_reason?: string | null
          required_approval_levels?: number
          staff_id: string
          staff_name?: string | null
          start_month: number
          start_year: number
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          advance_entry_id?: string | null
          amount?: number
          approval_history?: Json
          approved_at?: string | null
          created_at?: string
          current_approval_level?: number
          emi_months?: number
          floor?: string | null
          id?: string
          location?: string | null
          reason?: string
          rejection_reason?: string | null
          required_approval_levels?: number
          staff_id?: string
          staff_name?: string | null
          start_month?: number
          start_year?: number
          status?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      location_designation_shift_config: {
        Row: {
          created_at: string | null
          designation_id: string
          early_deduction_rate: number | null
          early_exit_time: string | null
          evening_verification_time: string | null
          full_day_requires_morning: boolean | null
          grace_early_min: number | null
          grace_late_min: number | null
          id: string
          late_deduction_rate: number | null
          location_name: string
          min_hours_full: number | null
          min_hours_half: number | null
          morning_cutoff: string | null
          shift_end: string | null
          shift_start: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          designation_id: string
          early_deduction_rate?: number | null
          early_exit_time?: string | null
          evening_verification_time?: string | null
          full_day_requires_morning?: boolean | null
          grace_early_min?: number | null
          grace_late_min?: number | null
          id?: string
          late_deduction_rate?: number | null
          location_name: string
          min_hours_full?: number | null
          min_hours_half?: number | null
          morning_cutoff?: string | null
          shift_end?: string | null
          shift_start?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          designation_id?: string
          early_deduction_rate?: number | null
          early_exit_time?: string | null
          evening_verification_time?: string | null
          full_day_requires_morning?: boolean | null
          grace_early_min?: number | null
          grace_late_min?: number | null
          id?: string
          late_deduction_rate?: number | null
          location_name?: string
          min_hours_full?: number | null
          min_hours_half?: number | null
          morning_cutoff?: string | null
          shift_end?: string | null
          shift_start?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_designation_shift_config_designation_id_fkey"
            columns: ["designation_id"]
            isOneToOne: false
            referencedRelation: "designations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_designation_shift_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_shift_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          created_at: string | null
          db_connection_string: string | null
          device_ip: string | null
          device_port: number | null
          device_type: string | null
          display_name: string
          id: string
          is_active: boolean | null
          last_sync_time: string | null
          latitude: number | null
          longitude: number | null
          name: string
          radius_meters: number | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          db_connection_string?: string | null
          device_ip?: string | null
          device_port?: number | null
          device_type?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          last_sync_time?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
          radius_meters?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          db_connection_string?: string | null
          device_ip?: string | null
          device_port?: number | null
          device_type?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          last_sync_time?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          radius_meters?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          total_advance_outstanding?: number
          total_salary?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "old_staff_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          updated_at?: string
          week_number?: number
          week_start_date?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "part_time_advance_tracking_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "part_time_settlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          generated_at: string | null
          generated_by: string | null
          headcount: number | null
          id: string
          locked_at: string | null
          month: number
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          tenant_id: string | null
          total_net: number | null
          year: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          generated_at?: string | null
          generated_by?: string | null
          headcount?: number | null
          id?: string
          locked_at?: string | null
          month: number
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status: string
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id?: string | null
          total_net?: number | null
          year: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          generated_at?: string | null
          generated_by?: string | null
          headcount?: number | null
          id?: string
          locked_at?: string | null
          month?: number
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          tenant_id?: string | null
          total_net?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_snapshots: {
        Row: {
          id: string
          run_id: string
          salary_detail: Json
          staff_id: string
          staff_snapshot: Json
          tenant_id: string | null
        }
        Insert: {
          id?: string
          run_id: string
          salary_detail: Json
          staff_id: string
          staff_snapshot: Json
          tenant_id?: string | null
        }
        Update: {
          id?: string
          run_id?: string
          salary_detail?: Json
          staff_id?: string
          staff_snapshot?: Json
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_snapshots_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_snapshots_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payslip_access_attempts: {
        Row: {
          attempts: number
          blocked_until: string | null
          client_key: string
          created_at: string
          failures: number
          id: string
          last_seen_at: string
          updated_at: string
          window_start: string
        }
        Insert: {
          attempts?: number
          blocked_until?: string | null
          client_key: string
          created_at?: string
          failures?: number
          id?: string
          last_seen_at?: string
          updated_at?: string
          window_start?: string
        }
        Update: {
          attempts?: number
          blocked_until?: string | null
          client_key?: string
          created_at?: string
          failures?: number
          id?: string
          last_seen_at?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      payslip_links: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          issued_by: string | null
          last_viewed_at: string | null
          month: number
          revoked_at: string | null
          snapshot: Json
          staff_id: string
          tenant_id: string | null
          token_hash: string
          updated_at: string
          view_count: number
          year: number
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          issued_by?: string | null
          last_viewed_at?: string | null
          month: number
          revoked_at?: string | null
          snapshot?: Json
          staff_id: string
          tenant_id?: string | null
          token_hash: string
          updated_at?: string
          view_count?: number
          year: number
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          issued_by?: string | null
          last_viewed_at?: string | null
          month?: number
          revoked_at?: string | null
          snapshot?: Json
          staff_id?: string
          tenant_id?: string | null
          token_hash?: string
          updated_at?: string
          view_count?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payslip_links_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslip_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "punch_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          app_user_id: string | null
          auth: string
          created_at: string | null
          device_name: string | null
          endpoint: string
          id: string
          p256dh: string
          staff_id: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          app_user_id?: string | null
          auth: string
          created_at?: string | null
          device_name?: string | null
          endpoint: string
          id?: string
          p256dh: string
          staff_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          app_user_id?: string | null
          auth?: string
          created_at?: string | null
          device_name?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          staff_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_app_user_id_fkey"
            columns: ["app_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_app_user_id_fkey"
            columns: ["app_user_id"]
            isOneToOne: false
            referencedRelation: "app_users_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_categories: {
        Row: {
          created_at: string | null
          display_name: string
          id: string
          is_active: boolean | null
          name: string
          sort_order: number | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          name: string
          sort_order?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_disbursements: {
        Row: {
          amount: number
          created_at: string | null
          disbursed_at: string | null
          id: string
          month_year: string
          notes: string | null
          payment_mode: string
          staff_id: string | null
          tenant_id: string | null
          transaction_ref: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          disbursed_at?: string | null
          id?: string
          month_year: string
          notes?: string | null
          payment_mode: string
          staff_id?: string | null
          tenant_id?: string | null
          transaction_ref?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          disbursed_at?: string | null
          id?: string
          month_year?: string
          notes?: string | null
          payment_mode?: string
          staff_id?: string | null
          tenant_id?: string | null
          transaction_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_disbursements_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_disbursements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string | null
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
          tenant_id?: string | null
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
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salary_hikes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_manual_overrides: {
        Row: {
          basic_override: number | null
          created_at: string
          early_leave_deduction_override: number | null
          hra_override: number | null
          id: string
          incentive_override: number | null
          late_coming_deduction_override: number | null
          meal_allowance_override: number | null
          month: number
          salary_supplements_override: Json | null
          staff_id: string | null
          sunday_penalty_override: number | null
          tenant_id: string | null
          updated_at: string
          year: number
        }
        Insert: {
          basic_override?: number | null
          created_at?: string
          early_leave_deduction_override?: number | null
          hra_override?: number | null
          id?: string
          incentive_override?: number | null
          late_coming_deduction_override?: number | null
          meal_allowance_override?: number | null
          month: number
          salary_supplements_override?: Json | null
          staff_id?: string | null
          sunday_penalty_override?: number | null
          tenant_id?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          basic_override?: number | null
          created_at?: string
          early_leave_deduction_override?: number | null
          hra_override?: number | null
          id?: string
          incentive_override?: number | null
          late_coming_deduction_override?: number | null
          meal_allowance_override?: number | null
          month?: number
          salary_supplements_override?: Json | null
          staff_id?: string | null
          sunday_penalty_override?: number | null
          tenant_id?: string | null
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
          {
            foreignKeyName: "salary_manual_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_rosters: {
        Row: {
          created_at: string | null
          date: string
          id: string
          is_published: boolean | null
          location: string
          shift_key: string
          staff_id: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          is_published?: boolean | null
          location: string
          shift_key: string
          staff_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          is_published?: boolean | null
          location?: string
          shift_key?: string
          staff_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_rosters_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_rosters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          device_id: string | null
          display_order: number | null
          email: string | null
          employee_code: string | null
          esi_number: string | null
          exempt_from_late_deduction: boolean | null
          experience: string
          floor: string | null
          hike_interval_months: number | null
          hra: number
          id: string
          ifsc_code: string | null
          incentive: number
          initial_salary: number | null
          is_active: boolean
          is_statutory: boolean
          joined_date: string
          location: string
          meal_allowance: number | null
          meal_allowance_threshold: number | null
          must_change_password: boolean
          name: string
          next_hike_date: string | null
          password_hash: string | null
          password_updated_at: string | null
          payment_mode: string | null
          pf_number: string | null
          photo_url: string | null
          salary_calculation_days: number | null
          salary_supplements: Json | null
          shift_window: Json | null
          staff_accommodation: string | null
          statutory_deductions: Json | null
          sunday_penalty: boolean | null
          tenant_id: string | null
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
          device_id?: string | null
          display_order?: number | null
          email?: string | null
          employee_code?: string | null
          esi_number?: string | null
          exempt_from_late_deduction?: boolean | null
          experience: string
          floor?: string | null
          hike_interval_months?: number | null
          hra?: number
          id?: string
          ifsc_code?: string | null
          incentive?: number
          initial_salary?: number | null
          is_active?: boolean
          is_statutory?: boolean
          joined_date: string
          location: string
          meal_allowance?: number | null
          meal_allowance_threshold?: number | null
          must_change_password?: boolean
          name: string
          next_hike_date?: string | null
          password_hash?: string | null
          password_updated_at?: string | null
          payment_mode?: string | null
          pf_number?: string | null
          photo_url?: string | null
          salary_calculation_days?: number | null
          salary_supplements?: Json | null
          shift_window?: Json | null
          staff_accommodation?: string | null
          statutory_deductions?: Json | null
          sunday_penalty?: boolean | null
          tenant_id?: string | null
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
          device_id?: string | null
          display_order?: number | null
          email?: string | null
          employee_code?: string | null
          esi_number?: string | null
          exempt_from_late_deduction?: boolean | null
          experience?: string
          floor?: string | null
          hike_interval_months?: number | null
          hra?: number
          id?: string
          ifsc_code?: string | null
          incentive?: number
          initial_salary?: number | null
          is_active?: boolean
          is_statutory?: boolean
          joined_date?: string
          location?: string
          meal_allowance?: number | null
          meal_allowance_threshold?: number | null
          must_change_password?: boolean
          name?: string
          next_hike_date?: string | null
          password_hash?: string | null
          password_updated_at?: string | null
          payment_mode?: string | null
          pf_number?: string | null
          photo_url?: string | null
          salary_calculation_days?: number | null
          salary_supplements?: Json | null
          shift_window?: Json | null
          staff_accommodation?: string | null
          statutory_deductions?: Json | null
          sunday_penalty?: boolean | null
          tenant_id?: string | null
          total_salary?: number
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_grievances: {
        Row: {
          approval_history: Json | null
          created_at: string | null
          current_approval_level: number | null
          description: string
          id: string
          required_approval_levels: number | null
          resolution_notes: string | null
          staff_id: string | null
          status: string | null
          target_date: string | null
          tenant_id: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          approval_history?: Json | null
          created_at?: string | null
          current_approval_level?: number | null
          description: string
          id?: string
          required_approval_levels?: number | null
          resolution_notes?: string | null
          staff_id?: string | null
          status?: string | null
          target_date?: string | null
          tenant_id?: string | null
          type: string
          updated_at?: string | null
        }
        Update: {
          approval_history?: Json | null
          created_at?: string | null
          current_approval_level?: number | null
          description?: string
          id?: string
          required_approval_levels?: number | null
          resolution_notes?: string | null
          staff_id?: string | null
          status?: string | null
          target_date?: string | null
          tenant_id?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_grievances_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_grievances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      statutory_portal_config: {
        Row: {
          created_at: string | null
          dashboard_widgets: Json
          data_visibility: Json
          id: string
          tenant_id: string | null
          updated_at: string | null
          visible_pages: Json
        }
        Insert: {
          created_at?: string | null
          dashboard_widgets?: Json
          data_visibility?: Json
          id?: string
          tenant_id?: string | null
          updated_at?: string | null
          visible_pages?: Json
        }
        Update: {
          created_at?: string | null
          dashboard_widgets?: Json
          data_visibility?: Json
          id?: string
          tenant_id?: string | null
          updated_at?: string | null
          visible_pages?: Json
        }
        Relationships: [
          {
            foreignKeyName: "statutory_portal_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_subscriptions: {
        Row: {
          amount: number
          billing_cycle: string
          created_at: string
          currency: string
          current_period_end: string | null
          current_period_start: string
          id: string
          plan: string
          status: string
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          billing_cycle?: string
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string
          id?: string
          plan?: string
          status?: string
          tenant_id: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_cycle?: string
          created_at?: string
          currency?: string
          current_period_end?: string | null
          current_period_start?: string
          id?: string
          plan?: string
          status?: string
          tenant_id?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          id: string
          location_limit: number
          name: string
          notes: string | null
          plan: string
          slug: string | null
          staff_device_lock_enabled: boolean
          staff_limit: number
          staff_portal_enabled: boolean
          status: string
          sub_user_limit: number
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          location_limit?: number
          name: string
          notes?: string | null
          plan?: string
          slug?: string | null
          staff_device_lock_enabled?: boolean
          staff_limit?: number
          staff_portal_enabled?: boolean
          status?: string
          sub_user_limit?: number
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          location_limit?: number
          name?: string
          notes?: string | null
          plan?: string
          slug?: string | null
          staff_device_lock_enabled?: boolean
          staff_limit?: number
          staff_portal_enabled?: boolean
          status?: string
          sub_user_limit?: number
          updated_at?: string
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
      workflow_configs: {
        Row: {
          created_at: string | null
          entity_type: string
          id: string
          is_active: boolean | null
          levels: Json
          name: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          entity_type?: string
          id?: string
          is_active?: boolean | null
          levels?: Json
          name: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          entity_type?: string
          id?: string
          is_active?: boolean | null
          levels?: Json
          name?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      update_tenant_slug: {
        Args: { p_new_slug: string; p_tenant_id: string }
        Returns: boolean
      }
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

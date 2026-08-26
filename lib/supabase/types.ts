export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          bucket_name: string
          bytes: number | null
          caption: string | null
          created_at: string
          expense_id: string | null
          fuel_log_id: string | null
          height: number | null
          id: string
          kind: Database["public"]["Enums"]["attachment_kind"]
          mod_plan_id: string | null
          part_id: string | null
          service_record_id: string | null
          sort_order: number
          storage_path: string
          timeline_note_id: string | null
          updated_at: string
          user_id: string
          width: number | null
        }
        Insert: {
          bucket_name: string
          bytes?: number | null
          caption?: string | null
          created_at?: string
          expense_id?: string | null
          fuel_log_id?: string | null
          height?: number | null
          id?: string
          kind: Database["public"]["Enums"]["attachment_kind"]
          mod_plan_id?: string | null
          part_id?: string | null
          service_record_id?: string | null
          sort_order?: number
          storage_path: string
          timeline_note_id?: string | null
          updated_at?: string
          user_id: string
          width?: number | null
        }
        Update: {
          bucket_name?: string
          bytes?: number | null
          caption?: string | null
          created_at?: string
          expense_id?: string | null
          fuel_log_id?: string | null
          height?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["attachment_kind"]
          mod_plan_id?: string | null
          part_id?: string | null
          service_record_id?: string | null
          sort_order?: number
          storage_path?: string
          timeline_note_id?: string | null
          updated_at?: string
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "v_expense_impact"
            referencedColumns: ["expense_id"]
          },
          {
            foreignKeyName: "attachments_fuel_log_id_fkey"
            columns: ["fuel_log_id"]
            isOneToOne: false
            referencedRelation: "fuel_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_mod_plan_id_fkey"
            columns: ["mod_plan_id"]
            isOneToOne: false
            referencedRelation: "mod_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_mod_plan_id_fkey"
            columns: ["mod_plan_id"]
            isOneToOne: false
            referencedRelation: "v_mod_costs"
            referencedColumns: ["mod_plan_id"]
          },
          {
            foreignKeyName: "attachments_part_id_fkey"
            columns: ["part_id"]
            isOneToOne: false
            referencedRelation: "parts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_service_record_id_fkey"
            columns: ["service_record_id"]
            isOneToOne: false
            referencedRelation: "service_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_timeline_note_id_fkey"
            columns: ["timeline_note_id"]
            isOneToOne: false
            referencedRelation: "timeline_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          currency: string | null
          id: string
          month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_categories_ranked"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          archived_at: string | null
          colour_hex: string
          created_at: string
          default_bucket: Database["public"]["Enums"]["expense_bucket"]
          default_counts_toward_budget: boolean
          icon: string
          id: string
          is_system: boolean
          name: string
          sort_order: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          colour_hex: string
          created_at?: string
          default_bucket: Database["public"]["Enums"]["expense_bucket"]
          default_counts_toward_budget: boolean
          icon: string
          id?: string
          is_system?: boolean
          name: string
          sort_order?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          colour_hex?: string
          created_at?: string
          default_bucket?: Database["public"]["Enums"]["expense_bucket"]
          default_counts_toward_budget?: boolean
          icon?: string
          id?: string
          is_system?: boolean
          name?: string
          sort_order?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amortize_months: number
          amount: number
          bucket: Database["public"]["Enums"]["expense_bucket"]
          category_id: string | null
          counts_toward_budget: boolean
          created_at: string
          currency: string
          fund_id: string | null
          id: string
          is_draft: boolean
          merchant: string | null
          mod_plan_id: string | null
          note: string | null
          occurred_on: string
          odometer_km: number | null
          recurring_id: string | null
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          amortize_months?: number
          amount: number
          bucket: Database["public"]["Enums"]["expense_bucket"]
          category_id?: string | null
          counts_toward_budget: boolean
          created_at?: string
          currency?: string
          fund_id?: string | null
          id?: string
          is_draft?: boolean
          merchant?: string | null
          mod_plan_id?: string | null
          note?: string | null
          occurred_on: string
          odometer_km?: number | null
          recurring_id?: string | null
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          amortize_months?: number
          amount?: number
          bucket?: Database["public"]["Enums"]["expense_bucket"]
          category_id?: string | null
          counts_toward_budget?: boolean
          created_at?: string
          currency?: string
          fund_id?: string | null
          id?: string
          is_draft?: boolean
          merchant?: string | null
          mod_plan_id?: string | null
          note?: string | null
          occurred_on?: string
          odometer_km?: number | null
          recurring_id?: string | null
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_categories_ranked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_mod_plan_id_fkey"
            columns: ["mod_plan_id"]
            isOneToOne: false
            referencedRelation: "mod_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_mod_plan_id_fkey"
            columns: ["mod_plan_id"]
            isOneToOne: false
            referencedRelation: "v_mod_costs"
            referencedColumns: ["mod_plan_id"]
          },
          {
            foreignKeyName: "expenses_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_fuel_summary"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "expenses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_totals"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "expenses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_logs: {
        Row: {
          created_at: string
          currency: string | null
          expense_id: string | null
          filled_on: string
          id: string
          is_full_tank: boolean
          litres: number
          missed_previous: boolean
          odometer_km: number
          station: string | null
          total_cost: number
          updated_at: string
          user_id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          expense_id?: string | null
          filled_on: string
          id?: string
          is_full_tank?: boolean
          litres: number
          missed_previous?: boolean
          odometer_km: number
          station?: string | null
          total_cost: number
          updated_at?: string
          user_id: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          expense_id?: string | null
          filled_on?: string
          id?: string
          is_full_tank?: boolean
          litres?: number
          missed_previous?: boolean
          odometer_km?: number
          station?: string | null
          total_cost?: number
          updated_at?: string
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_logs_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_logs_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "v_expense_impact"
            referencedColumns: ["expense_id"]
          },
          {
            foreignKeyName: "fuel_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_fuel_summary"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "fuel_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_totals"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "fuel_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_contributions: {
        Row: {
          amount: number
          created_at: string
          fund_id: string
          id: string
          note: string | null
          occurred_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          fund_id: string
          id?: string
          note?: string | null
          occurred_on: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          fund_id?: string
          id?: string
          note?: string | null
          occurred_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_contributions_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          closed_at: string | null
          created_at: string
          currency: string | null
          id: string
          mod_plan_id: string | null
          monthly_contribution: number | null
          name: string
          target_amount: number
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          mod_plan_id?: string | null
          monthly_contribution?: number | null
          name: string
          target_amount: number
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          mod_plan_id?: string | null
          monthly_contribution?: number | null
          name?: string
          target_amount?: number
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funds_mod_plan_id_fkey"
            columns: ["mod_plan_id"]
            isOneToOne: false
            referencedRelation: "mod_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funds_mod_plan_id_fkey"
            columns: ["mod_plan_id"]
            isOneToOne: false
            referencedRelation: "v_mod_costs"
            referencedColumns: ["mod_plan_id"]
          },
          {
            foreignKeyName: "funds_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_fuel_summary"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "funds_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_totals"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "funds_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          achieved_on: string
          auto: boolean
          body: string | null
          created_at: string
          id: string
          kind: string
          title: string
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          achieved_on: string
          auto?: boolean
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          title: string
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          achieved_on?: string
          auto?: boolean
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          title?: string
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "milestones_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_fuel_summary"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "milestones_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_totals"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "milestones_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      mod_dependencies: {
        Row: {
          created_at: string
          depends_on_id: string
          mod_plan_id: string
        }
        Insert: {
          created_at?: string
          depends_on_id: string
          mod_plan_id: string
        }
        Update: {
          created_at?: string
          depends_on_id?: string
          mod_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mod_dependencies_depends_on_id_fkey"
            columns: ["depends_on_id"]
            isOneToOne: false
            referencedRelation: "mod_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mod_dependencies_depends_on_id_fkey"
            columns: ["depends_on_id"]
            isOneToOne: false
            referencedRelation: "v_mod_costs"
            referencedColumns: ["mod_plan_id"]
          },
          {
            foreignKeyName: "mod_dependencies_mod_plan_id_fkey"
            columns: ["mod_plan_id"]
            isOneToOne: false
            referencedRelation: "mod_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mod_dependencies_mod_plan_id_fkey"
            columns: ["mod_plan_id"]
            isOneToOne: false
            referencedRelation: "v_mod_costs"
            referencedColumns: ["mod_plan_id"]
          },
        ]
      }
      mod_plans: {
        Row: {
          archived_at: string | null
          board_order: number
          created_at: string
          currency: string | null
          description: string | null
          est_cost_max: number | null
          est_cost_min: number | null
          id: string
          installed_on: string | null
          links: Json
          notes: string | null
          priority: Database["public"]["Enums"]["mod_priority"]
          status: Database["public"]["Enums"]["mod_status"]
          target_date: string | null
          title: string
          updated_at: string
          user_id: string
          vehicle_id: string
        }
        Insert: {
          archived_at?: string | null
          board_order?: number
          created_at?: string
          currency?: string | null
          description?: string | null
          est_cost_max?: number | null
          est_cost_min?: number | null
          id?: string
          installed_on?: string | null
          links?: Json
          notes?: string | null
          priority?: Database["public"]["Enums"]["mod_priority"]
          status?: Database["public"]["Enums"]["mod_status"]
          target_date?: string | null
          title: string
          updated_at?: string
          user_id: string
          vehicle_id: string
        }
        Update: {
          archived_at?: string | null
          board_order?: number
          created_at?: string
          currency?: string | null
          description?: string | null
          est_cost_max?: number | null
          est_cost_min?: number | null
          id?: string
          installed_on?: string | null
          links?: Json
          notes?: string | null
          priority?: Database["public"]["Enums"]["mod_priority"]
          status?: Database["public"]["Enums"]["mod_status"]
          target_date?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mod_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_fuel_summary"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "mod_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_totals"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "mod_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      parts: {
        Row: {
          brand: string | null
          created_at: string
          expense_id: string | null
          id: string
          installed_on: string | null
          mod_plan_id: string | null
          name: string
          notes: string | null
          part_number: string | null
          removed_on: string | null
          sale_expense_id: string | null
          status: Database["public"]["Enums"]["part_status"]
          updated_at: string
          user_id: string
          vehicle_id: string
          warranty_until: string | null
        }
        Insert: {
          brand?: string | null
          created_at?: string
          expense_id?: string | null
          id?: string
          installed_on?: string | null
          mod_plan_id?: string | null
          name: string
          notes?: string | null
          part_number?: string | null
          removed_on?: string | null
          sale_expense_id?: string | null
          status?: Database["public"]["Enums"]["part_status"]
          updated_at?: string
          user_id: string
          vehicle_id: string
          warranty_until?: string | null
        }
        Update: {
          brand?: string | null
          created_at?: string
          expense_id?: string | null
          id?: string
          installed_on?: string | null
          mod_plan_id?: string | null
          name?: string
          notes?: string | null
          part_number?: string | null
          removed_on?: string | null
          sale_expense_id?: string | null
          status?: Database["public"]["Enums"]["part_status"]
          updated_at?: string
          user_id?: string
          vehicle_id?: string
          warranty_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parts_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "v_expense_impact"
            referencedColumns: ["expense_id"]
          },
          {
            foreignKeyName: "parts_mod_plan_id_fkey"
            columns: ["mod_plan_id"]
            isOneToOne: false
            referencedRelation: "mod_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_mod_plan_id_fkey"
            columns: ["mod_plan_id"]
            isOneToOne: false
            referencedRelation: "v_mod_costs"
            referencedColumns: ["mod_plan_id"]
          },
          {
            foreignKeyName: "parts_sale_expense_id_fkey"
            columns: ["sale_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_sale_expense_id_fkey"
            columns: ["sale_expense_id"]
            isOneToOne: false
            referencedRelation: "v_expense_impact"
            referencedColumns: ["expense_id"]
          },
          {
            foreignKeyName: "parts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_fuel_summary"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "parts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_totals"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "parts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          amortise_suggest_multiplier: number | null
          base_currency: string
          created_at: string
          default_view: string
          display_name: string | null
          distance_unit: string
          id: string
          locale: string
          timezone: string
          updated_at: string
          volume_unit: string
        }
        Insert: {
          amortise_suggest_multiplier?: number | null
          base_currency?: string
          created_at?: string
          default_view?: string
          display_name?: string | null
          distance_unit?: string
          id: string
          locale?: string
          timezone?: string
          updated_at?: string
          volume_unit?: string
        }
        Update: {
          amortise_suggest_multiplier?: number | null
          base_currency?: string
          created_at?: string
          default_view?: string
          display_name?: string | null
          distance_unit?: string
          id?: string
          locale?: string
          timezone?: string
          updated_at?: string
          volume_unit?: string
        }
        Relationships: []
      }
      recurring_expenses: {
        Row: {
          active: boolean
          amount: number | null
          bucket: Database["public"]["Enums"]["expense_bucket"] | null
          cadence: Database["public"]["Enums"]["recurrence"]
          category_id: string | null
          counts_toward_budget: boolean | null
          created_at: string
          currency: string | null
          day_of_month: number | null
          id: string
          label: string
          month_of_year: number | null
          next_due: string
          updated_at: string
          user_id: string
          vehicle_id: string | null
        }
        Insert: {
          active?: boolean
          amount?: number | null
          bucket?: Database["public"]["Enums"]["expense_bucket"] | null
          cadence: Database["public"]["Enums"]["recurrence"]
          category_id?: string | null
          counts_toward_budget?: boolean | null
          created_at?: string
          currency?: string | null
          day_of_month?: number | null
          id?: string
          label: string
          month_of_year?: number | null
          next_due: string
          updated_at?: string
          user_id: string
          vehicle_id?: string | null
        }
        Update: {
          active?: boolean
          amount?: number | null
          bucket?: Database["public"]["Enums"]["expense_bucket"] | null
          cadence?: Database["public"]["Enums"]["recurrence"]
          category_id?: string | null
          counts_toward_budget?: boolean | null
          created_at?: string
          currency?: string | null
          day_of_month?: number | null
          id?: string
          label?: string
          month_of_year?: number | null
          next_due?: string
          updated_at?: string
          user_id?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_categories_ranked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_expenses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_fuel_summary"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "recurring_expenses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_totals"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "recurring_expenses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_records: {
        Row: {
          created_at: string
          expense_id: string | null
          id: string
          name: string
          notes: string | null
          odometer_km: number | null
          performed_on: string
          schedule_id: string | null
          updated_at: string
          user_id: string
          vehicle_id: string
          workshop: string | null
        }
        Insert: {
          created_at?: string
          expense_id?: string | null
          id?: string
          name: string
          notes?: string | null
          odometer_km?: number | null
          performed_on: string
          schedule_id?: string | null
          updated_at?: string
          user_id: string
          vehicle_id: string
          workshop?: string | null
        }
        Update: {
          created_at?: string
          expense_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          odometer_km?: number | null
          performed_on?: string
          schedule_id?: string | null
          updated_at?: string
          user_id?: string
          vehicle_id?: string
          workshop?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_records_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_records_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "v_expense_impact"
            referencedColumns: ["expense_id"]
          },
          {
            foreignKeyName: "service_records_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "service_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_records_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "v_service_due"
            referencedColumns: ["schedule_id"]
          },
          {
            foreignKeyName: "service_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_fuel_summary"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "service_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_totals"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "service_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_schedules: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          interval_km: number | null
          interval_months: number | null
          last_done_km: number | null
          last_done_on: string | null
          name: string
          notes: string | null
          updated_at: string
          user_id: string
          vehicle_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          interval_km?: number | null
          interval_months?: number | null
          last_done_km?: number | null
          last_done_on?: string | null
          name: string
          notes?: string | null
          updated_at?: string
          user_id: string
          vehicle_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          interval_km?: number | null
          interval_months?: number | null
          last_done_km?: number | null
          last_done_on?: string | null
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_schedules_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_fuel_summary"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "service_schedules_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_totals"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "service_schedules_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_notes: {
        Row: {
          body: string | null
          created_at: string
          id: string
          occurred_on: string
          odometer_km: number | null
          title: string
          updated_at: string
          user_id: string
          vehicle_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          occurred_on: string
          odometer_km?: number | null
          title: string
          updated_at?: string
          user_id: string
          vehicle_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          occurred_on?: string
          odometer_km?: number | null
          title?: string
          updated_at?: string
          user_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_notes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_fuel_summary"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "timeline_notes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_totals"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "timeline_notes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          archived_at: string | null
          colour_hex: string | null
          created_at: string
          currency: string | null
          fuel_type: string | null
          hero_photo_path: string | null
          id: string
          make: string | null
          model: string | null
          nickname: string
          odometer_at: string | null
          odometer_km: number
          plate: string | null
          purchase_date: string | null
          purchase_odometer_km: number
          purchase_price: number | null
          sold_date: string | null
          sold_price: number | null
          sort_order: number
          status: Database["public"]["Enums"]["vehicle_status"]
          transmission: string | null
          trim: string | null
          updated_at: string
          user_id: string
          year: number | null
        }
        Insert: {
          archived_at?: string | null
          colour_hex?: string | null
          created_at?: string
          currency?: string | null
          fuel_type?: string | null
          hero_photo_path?: string | null
          id?: string
          make?: string | null
          model?: string | null
          nickname: string
          odometer_at?: string | null
          odometer_km?: number
          plate?: string | null
          purchase_date?: string | null
          purchase_odometer_km: number
          purchase_price?: number | null
          sold_date?: string | null
          sold_price?: number | null
          sort_order?: number
          status?: Database["public"]["Enums"]["vehicle_status"]
          transmission?: string | null
          trim?: string | null
          updated_at?: string
          user_id: string
          year?: number | null
        }
        Update: {
          archived_at?: string | null
          colour_hex?: string | null
          created_at?: string
          currency?: string | null
          fuel_type?: string | null
          hero_photo_path?: string | null
          id?: string
          make?: string | null
          model?: string | null
          nickname?: string
          odometer_at?: string | null
          odometer_km?: number
          plate?: string | null
          purchase_date?: string | null
          purchase_odometer_km?: number
          purchase_price?: number | null
          sold_date?: string | null
          sold_price?: number | null
          sort_order?: number
          status?: Database["public"]["Enums"]["vehicle_status"]
          transmission?: string | null
          trim?: string | null
          updated_at?: string
          user_id?: string
          year?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      v_amortise_suggestion: {
        Row: {
          median_amount: number | null
          multiplier: number | null
          threshold: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_categories_ranked: {
        Row: {
          archived_at: string | null
          colour_hex: string | null
          created_at: string | null
          default_bucket: Database["public"]["Enums"]["expense_bucket"] | null
          default_counts_toward_budget: boolean | null
          icon: string | null
          id: string | null
          is_system: boolean | null
          last_used_on: string | null
          name: string | null
          sort_order: number | null
          updated_at: string | null
          user_id: string | null
          uses_all: number | null
          uses_recent: number | null
        }
        Relationships: []
      }
      v_category_usage: {
        Row: {
          category_id: string | null
          last_used_on: string | null
          user_id: string | null
          uses_all: number | null
          uses_recent: number | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_categories_ranked"
            referencedColumns: ["id"]
          },
        ]
      }
      v_expense_impact: {
        Row: {
          amount: number | null
          bucket: Database["public"]["Enums"]["expense_bucket"] | null
          category_id: string | null
          currency: string | null
          expense_id: string | null
          impact_month: string | null
          user_id: string | null
          vehicle_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "v_categories_ranked"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_fuel_summary"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "expenses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_totals"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "expenses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_fuel_consumption: {
        Row: {
          cost: number | null
          cost_per_km: number | null
          cost_per_litre: number | null
          currency: string | null
          end_fuel_log_id: string | null
          end_km: number | null
          ended_on: string | null
          fills: number | null
          km: number | null
          km_per_l: number | null
          l_per_100km: number | null
          litres: number | null
          rolling3_l_per_100km: number | null
          start_km: number | null
          started_on: string | null
          user_id: string | null
          vehicle_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_fuel_summary"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "fuel_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_totals"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "fuel_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_fuel_summary: {
        Row: {
          cost_per_km: number | null
          currency: string | null
          fills: number | null
          first_on: string | null
          intervals: number | null
          km_per_l: number | null
          l_per_100km: number | null
          last_on: string | null
          latest_km_per_l: number | null
          latest_l_per_100km: number | null
          latest_on: string | null
          measured_km: number | null
          measured_litres: number | null
          rolling3_l_per_100km: number | null
          total_cost: number | null
          total_litres: number | null
          user_id: string | null
          vehicle_id: string | null
        }
        Relationships: []
      }
      v_mod_board_totals: {
        Row: {
          actual_total: number | null
          currency: string | null
          estimate_max_total: number | null
          estimate_min_total: number | null
          estimate_total: number | null
          mods: number | null
          status: Database["public"]["Enums"]["mod_status"] | null
          user_id: string | null
          vehicle_id: string | null
          without_estimate: number | null
        }
        Relationships: [
          {
            foreignKeyName: "mod_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_fuel_summary"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "mod_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_totals"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "mod_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_mod_costs: {
        Row: {
          actual: number | null
          currency: string | null
          est_cost_max: number | null
          est_cost_min: number | null
          estimate: number | null
          expense_count: number | null
          mod_plan_id: string | null
          priority: Database["public"]["Enums"]["mod_priority"] | null
          status: Database["public"]["Enums"]["mod_status"] | null
          user_id: string | null
          variance: number | null
          vehicle_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mod_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_fuel_summary"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "mod_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_totals"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "mod_plans_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_month_totals: {
        Row: {
          all_in_count: number | null
          all_in_total: number | null
          car_only_count: number | null
          car_only_total: number | null
          currency: string | null
          month: string | null
          monthly_count: number | null
          monthly_total: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_monthly_impact: {
        Row: {
          currency: string | null
          expense_count: number | null
          impact_month: string | null
          total: number | null
          user_id: string | null
        }
        Relationships: []
      }
      v_service_due: {
        Row: {
          basis: string | null
          basis_km: number | null
          basis_on: string | null
          day_fraction: number | null
          days_remaining: number | null
          due_by: string | null
          due_date: string | null
          due_km: number | null
          interval_km: number | null
          interval_months: number | null
          km_fraction: number | null
          km_remaining: number | null
          last_done_km: number | null
          last_done_on: string | null
          name: string | null
          notes: string | null
          odometer_km: number | null
          remaining_fraction: number | null
          schedule_id: string | null
          state: string | null
          urgency: number | null
          user_id: string | null
          vehicle_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_schedules_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_fuel_summary"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "service_schedules_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "v_vehicle_totals"
            referencedColumns: ["vehicle_id"]
          },
          {
            foreignKeyName: "service_schedules_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      v_timeline: {
        Row: {
          amount: number | null
          created_at: string | null
          currency: string | null
          kind: Database["public"]["Enums"]["timeline_kind"] | null
          occurred_on: string | null
          ref_id: string | null
          subtitle: string | null
          title: string | null
          user_id: string | null
          vehicle_id: string | null
        }
        Relationships: []
      }
      v_vehicle_month_totals: {
        Row: {
          all_in_count: number | null
          all_in_total: number | null
          car_only_count: number | null
          car_only_total: number | null
          currency: string | null
          month: string | null
          monthly_count: number | null
          monthly_total: number | null
          user_id: string | null
          vehicle_id: string | null
        }
        Relationships: []
      }
      v_vehicle_totals: {
        Row: {
          cost_per_km: number | null
          currency: string | null
          km_driven: number | null
          months_owned: number | null
          planning_accuracy: number | null
          project_spend: number | null
          purchase_price: number | null
          running_spend: number | null
          total_invested: number | null
          total_spend: number | null
          user_id: string | null
          vehicle_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      ledger_page: {
        Args: {
          p_amount_max?: number
          p_amount_min?: number
          p_buckets?: Database["public"]["Enums"]["expense_bucket"][]
          p_category_ids?: string[]
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_cursor_occurred_on?: string
          p_from?: string
          p_has_photo?: boolean
          p_include_drafts?: boolean
          p_limit?: number
          p_search?: string
          p_to?: string
          p_vehicle_ids?: string[]
        }
        Returns: {
          amortize_months: number
          amount: number
          attachment_count: number
          bucket: Database["public"]["Enums"]["expense_bucket"]
          category_colour_hex: string
          category_icon: string
          category_id: string
          category_name: string
          counts_toward_budget: boolean
          created_at: string
          currency: string
          day_count: number
          day_total: number
          id: string
          is_draft: boolean
          merchant: string
          note: string
          occurred_on: string
          odometer_km: number
          vehicle_id: string
          vehicle_nickname: string
        }[]
      }
      mod_board: {
        Args: { p_vehicle_id: string }
        Returns: {
          actual: number
          board_order: number
          created_at: string
          currency: string
          depends_on: Json
          description: string
          est_cost_max: number
          est_cost_min: number
          estimate: number
          expense_count: number
          id: string
          installed_on: string
          links: Json
          notes: string
          photos: Json
          priority: Database["public"]["Enums"]["mod_priority"]
          status: Database["public"]["Enums"]["mod_status"]
          target_date: string
          title: string
          variance: number
          vehicle_id: string
        }[]
      }
      mod_reorder: {
        Args: { p_moves: Json; p_today: string; p_vehicle_id: string }
        Returns: number
      }
      timeline_page: {
        Args: {
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_cursor_occurred_on?: string
          p_limit?: number
          p_vehicle_id: string
        }
        Returns: {
          amount: number
          created_at: string
          currency: string
          items: Json
          kind: Database["public"]["Enums"]["timeline_kind"]
          occurred_on: string
          photos: Json
          ref_id: string
          subtitle: string
          title: string
          vehicle_id: string
        }[]
      }
    }
    Enums: {
      attachment_kind: "receipt" | "inspiration" | "progress" | "document"
      expense_bucket: "life" | "car_running" | "car_project"
      mod_priority: "needed" | "next_up" | "someday" | "dreaming"
      mod_status:
        | "dreaming"
        | "researching"
        | "saving"
        | "ordered"
        | "installed"
        | "abandoned"
      part_status: "on_car" | "shelf" | "sold" | "binned"
      recurrence: "monthly" | "quarterly" | "yearly"
      timeline_kind:
        | "expense"
        | "mod"
        | "service"
        | "fuel"
        | "milestone"
        | "note"
      vehicle_status: "owned" | "sold"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      attachment_kind: ["receipt", "inspiration", "progress", "document"],
      expense_bucket: ["life", "car_running", "car_project"],
      mod_priority: ["needed", "next_up", "someday", "dreaming"],
      mod_status: [
        "dreaming",
        "researching",
        "saving",
        "ordered",
        "installed",
        "abandoned",
      ],
      part_status: ["on_car", "shelf", "sold", "binned"],
      recurrence: ["monthly", "quarterly", "yearly"],
      timeline_kind: ["expense", "mod", "service", "fuel", "milestone", "note"],
      vehicle_status: ["owned", "sold"],
    },
  },
} as const


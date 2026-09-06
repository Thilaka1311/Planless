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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      discovery_items: {
        Row: {
          category: Database["public"]["Enums"]["discovery_category"]
          cover_image_url: string | null
          created_at: string
          default_rsvp_offset_minutes: number | null
          description: string | null
          display_order: number | null
          featured: boolean | null
          id: string
          latitude: number | null
          location: string | null
          longitude: number | null
          place_address: string | null
          place_id: string | null
          place_name: string | null
          public_id: string
          section_id: string | null
          status: Database["public"]["Enums"]["discovery_status"]
          subcategory: string | null
          suggested_capacity: number | null
          suggested_cost_amount: number | null
          suggested_duration_minutes: number | null
          title: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["discovery_category"]
          cover_image_url?: string | null
          created_at?: string
          default_rsvp_offset_minutes?: number | null
          description?: string | null
          display_order?: number | null
          featured?: boolean | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          place_address?: string | null
          place_id?: string | null
          place_name?: string | null
          public_id?: string
          section_id?: string | null
          status?: Database["public"]["Enums"]["discovery_status"]
          subcategory?: string | null
          suggested_capacity?: number | null
          suggested_cost_amount?: number | null
          suggested_duration_minutes?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["discovery_category"]
          cover_image_url?: string | null
          created_at?: string
          default_rsvp_offset_minutes?: number | null
          description?: string | null
          display_order?: number | null
          featured?: boolean | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          place_address?: string | null
          place_id?: string | null
          place_name?: string | null
          public_id?: string
          section_id?: string | null
          status?: Database["public"]["Enums"]["discovery_status"]
          subcategory?: string | null
          suggested_capacity?: number | null
          suggested_cost_amount?: number | null
          suggested_duration_minutes?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovery_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "discovery_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_sections: {
        Row: {
          category: Database["public"]["Enums"]["discovery_category"]
          created_at: string
          display_order: number | null
          id: string
          public_id: string
          status: Database["public"]["Enums"]["discovery_status"]
          subcategory: string | null
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["discovery_category"]
          created_at?: string
          display_order?: number | null
          id?: string
          public_id: string
          status?: Database["public"]["Enums"]["discovery_status"]
          subcategory?: string | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["discovery_category"]
          created_at?: string
          display_order?: number | null
          id?: string
          public_id?: string
          status?: Database["public"]["Enums"]["discovery_status"]
          subcategory?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          created_at: string
          created_from_plan_id: string | null
          id: string
          requested_by: string
          responded_at: string | null
          status: Database["public"]["Enums"]["friendship_status"]
          user_1_id: string
          user_2_id: string
        }
        Insert: {
          created_at?: string
          created_from_plan_id?: string | null
          id?: string
          requested_by: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["friendship_status"]
          user_1_id: string
          user_2_id: string
        }
        Update: {
          created_at?: string
          created_from_plan_id?: string | null
          id?: string
          requested_by?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["friendship_status"]
          user_1_id?: string
          user_2_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_created_from_plan_id_fkey"
            columns: ["created_from_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_1_id_fkey"
            columns: ["user_1_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_2_id_fkey"
            columns: ["user_2_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      memories: {
        Row: {
          created_at: string
          editable_until: string | null
          id: string
          locked_at: string | null
          memory_type: string
          plan_id: string
          status: string
        }
        Insert: {
          created_at?: string
          editable_until?: string | null
          id?: string
          locked_at?: string | null
          memory_type?: string
          plan_id: string
          status?: string
        }
        Update: {
          created_at?: string
          editable_until?: string | null
          id?: string
          locked_at?: string | null
          memory_type?: string
          plan_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "memories_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_results: {
        Row: {
          average_rating: number | null
          created_at: string
          id: string
          memory_id: string
          mvp_user_id: string | null
          review: string | null
          score_away: number | null
          score_home: number | null
        }
        Insert: {
          average_rating?: number | null
          created_at?: string
          id?: string
          memory_id: string
          mvp_user_id?: string | null
          review?: string | null
          score_away?: number | null
          score_home?: number | null
        }
        Update: {
          average_rating?: number | null
          created_at?: string
          id?: string
          memory_id?: string
          mvp_user_id?: string | null
          review?: string | null
          score_away?: number | null
          score_home?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "memory_results_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: true
            referencedRelation: "memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memory_results_mvp_user_id_fkey"
            columns: ["mvp_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          is_read: boolean
          read_at: string | null
          related_plan_id: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          is_read?: boolean
          read_at?: string | null
          related_plan_id?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_read?: boolean
          read_at?: string | null
          related_plan_id?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_related_plan_id_fkey"
            columns: ["related_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_activity: {
        Row: {
          activity_type: Database["public"]["Enums"]["plan_activity_type"]
          actor_id: string | null
          created_at: string
          id: string
          metadata: Json
          plan_id: string
          target_user_id: string | null
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["plan_activity_type"]
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          plan_id: string
          target_user_id?: string | null
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["plan_activity_type"]
          actor_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          plan_id?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_activity_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_activity_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_activity_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_invites: {
        Row: {
          created_at: string
          created_by: string
          id: string
          invite_token: string
          is_active: boolean
          plan_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          invite_token: string
          is_active?: boolean
          plan_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          invite_token?: string
          is_active?: boolean
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_invites_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          message_type: Database["public"]["Enums"]["message_type"]
          plan_id: string
          sender_id: string
          system_message_type:
            | Database["public"]["Enums"]["system_message_type"]
            | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          message_type?: Database["public"]["Enums"]["message_type"]
          plan_id: string
          sender_id: string
          system_message_type?:
            | Database["public"]["Enums"]["system_message_type"]
            | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          message_type?: Database["public"]["Enums"]["message_type"]
          plan_id?: string
          sender_id?: string
          system_message_type?:
            | Database["public"]["Enums"]["system_message_type"]
            | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_messages_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_outcomes: {
        Row: {
          created_at: string
          id: string
          outcome_type: string
          payload: Json
          plan_id: string
          submitted_by_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          outcome_type: string
          payload?: Json
          plan_id: string
          submitted_by_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          outcome_type?: string
          payload?: Json
          plan_id?: string
          submitted_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_outcomes_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_outcomes_submitted_by_user_id_fkey"
            columns: ["submitted_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_participants: {
        Row: {
          assigned_group:
            | Database["public"]["Enums"]["assigned_group_enum"]
            | null
          circle_id: string | null
          cost_per_participant: number | null
          created_at: string
          delivery_status: string
          final_attendance:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          final_state: Database["public"]["Enums"]["rsvp_status"] | null
          joined_queue_at: string | null
          leave_requested: boolean
          leave_requested_at: string | null
          plan_id: string
          responded_at: string | null
          role: Database["public"]["Enums"]["participant_role"]
          rsvp_status: Database["public"]["Enums"]["rsvp_status"]
          skip_reason: Database["public"]["Enums"]["skip_reason"] | null
          updated_at: string
          user_id: string
          waitlist_position: number | null
        }
        Insert: {
          assigned_group?:
            | Database["public"]["Enums"]["assigned_group_enum"]
            | null
          circle_id?: string | null
          cost_per_participant?: number | null
          created_at?: string
          delivery_status?: string
          final_attendance?:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          final_state?: Database["public"]["Enums"]["rsvp_status"] | null
          joined_queue_at?: string | null
          leave_requested?: boolean
          leave_requested_at?: string | null
          plan_id: string
          responded_at?: string | null
          role?: Database["public"]["Enums"]["participant_role"]
          rsvp_status?: Database["public"]["Enums"]["rsvp_status"]
          skip_reason?: Database["public"]["Enums"]["skip_reason"] | null
          updated_at?: string
          user_id: string
          waitlist_position?: number | null
        }
        Update: {
          assigned_group?:
            | Database["public"]["Enums"]["assigned_group_enum"]
            | null
          circle_id?: string | null
          cost_per_participant?: number | null
          created_at?: string
          delivery_status?: string
          final_attendance?:
            | Database["public"]["Enums"]["attendance_status"]
            | null
          final_state?: Database["public"]["Enums"]["rsvp_status"] | null
          joined_queue_at?: string | null
          leave_requested?: boolean
          leave_requested_at?: string | null
          plan_id?: string
          responded_at?: string | null
          role?: Database["public"]["Enums"]["participant_role"]
          rsvp_status?: Database["public"]["Enums"]["rsvp_status"]
          skip_reason?: Database["public"]["Enums"]["skip_reason"] | null
          updated_at?: string
          user_id?: string
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_participants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_team_assignments: {
        Row: {
          created_at: string
          id: string
          plan_id: string
          team: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_id: string
          team: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_id?: string
          team?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_team_assignments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_team_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          allow_participant_invites: boolean
          attended_participants: number
          category: string
          cover_image: string | null
          created_at: string
          discovery_item_id: string | null
          id: string
          latitude: number | null
          longitude: number | null
          max_participants: number | null
          participant_filtering: Database["public"]["Enums"]["participant_filtering_type"]
          place_address: string
          place_id: string | null
          place_name: string
          public_id: string
          rsvp_deadline: string
          scheduled_at: string
          status: Database["public"]["Enums"]["plan_status"]
          subcategory: string
          title: string
          total_cost: number
          updated_at: string
          waitlist_order_mode: Database["public"]["Enums"]["waitlist_order_mode_enum"]
        }
        Insert: {
          allow_participant_invites?: boolean
          attended_participants?: number
          category?: string
          cover_image?: string | null
          created_at?: string
          discovery_item_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          max_participants?: number | null
          participant_filtering?: Database["public"]["Enums"]["participant_filtering_type"]
          place_address: string
          place_id?: string | null
          place_name: string
          public_id: string
          rsvp_deadline: string
          scheduled_at: string
          status?: Database["public"]["Enums"]["plan_status"]
          subcategory?: string
          title: string
          total_cost?: number
          updated_at?: string
          waitlist_order_mode?: Database["public"]["Enums"]["waitlist_order_mode_enum"]
        }
        Update: {
          allow_participant_invites?: boolean
          attended_participants?: number
          category?: string
          cover_image?: string | null
          created_at?: string
          discovery_item_id?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          max_participants?: number | null
          participant_filtering?: Database["public"]["Enums"]["participant_filtering_type"]
          place_address?: string
          place_id?: string | null
          place_name?: string
          public_id?: string
          rsvp_deadline?: string
          scheduled_at?: string
          status?: Database["public"]["Enums"]["plan_status"]
          subcategory?: string
          title?: string
          total_cost?: number
          updated_at?: string
          waitlist_order_mode?: Database["public"]["Enums"]["waitlist_order_mode_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "plans_discovery_item_id_fkey"
            columns: ["discovery_item_id"]
            isOneToOne: false
            referencedRelation: "discovery_items"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          bio: string
          created_at: string
          friends: number
          full_name: string
          id: string
          profile_completed: boolean
          profile_photo_path: string | null
          public_id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          username: string | null
        }
        Insert: {
          bio?: string
          created_at?: string
          friends?: number
          full_name?: string
          id: string
          profile_completed?: boolean
          profile_photo_path?: string | null
          public_id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username?: string | null
        }
        Update: {
          bio?: string
          created_at?: string
          friends?: number
          full_name?: string
          id?: string
          profile_completed?: boolean
          profile_photo_path?: string | null
          public_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      wallet_expense_participants: {
        Row: {
          amount_owed: number
          amount_paid: number
          created_at: string
          expense_id: string
          id: string
          status: Database["public"]["Enums"]["participant_payment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_owed: number
          amount_paid?: number
          created_at?: string
          expense_id: string
          id?: string
          status?: Database["public"]["Enums"]["participant_payment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_owed?: number
          amount_paid?: number
          created_at?: string
          expense_id?: string
          id?: string
          status?: Database["public"]["Enums"]["participant_payment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_expense_participants_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "wallet_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_expense_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_expenses: {
        Row: {
          created_at: string
          expense_type:
            | Database["public"]["Enums"]["wallet_expense_type"]
            | null
          id: string
          message_id: string | null
          payer_id: string
          plan_id: string
          public_id: string
          status: Database["public"]["Enums"]["wallet_expense_status"]
          title: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          expense_type?:
            | Database["public"]["Enums"]["wallet_expense_type"]
            | null
          id?: string
          message_id?: string | null
          payer_id: string
          plan_id: string
          public_id: string
          status?: Database["public"]["Enums"]["wallet_expense_status"]
          title: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          expense_type?:
            | Database["public"]["Enums"]["wallet_expense_type"]
            | null
          id?: string
          message_id?: string | null
          payer_id?: string
          plan_id?: string
          public_id?: string
          status?: Database["public"]["Enums"]["wallet_expense_status"]
          title?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_expenses_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "plan_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_expenses_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_expenses_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_settlement_allocations: {
        Row: {
          amount: number
          created_at: string
          expense_participant_id: string
          id: string
          settlement_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          expense_participant_id: string
          id?: string
          settlement_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          expense_participant_id?: string
          id?: string
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_settlement_allocations_expense_participant_id_fkey"
            columns: ["expense_participant_id"]
            isOneToOne: false
            referencedRelation: "wallet_expense_participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_settlement_allocations_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "wallet_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_settlements: {
        Row: {
          amount: number
          created_at: string
          id: string
          payer_id: string
          plan_id: string | null
          receiver_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payer_id: string
          plan_id?: string | null
          receiver_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payer_id?: string
          plan_id?: string | null
          receiver_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_settlements_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_settlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_settlements_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          created_at: string
          expense_id: string
          id: string
          plan_id: string
          public_id: string | null
          receiver_id: string
          sender_id: string
          status: Database["public"]["Enums"]["transaction_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          expense_id: string
          id?: string
          plan_id: string
          public_id?: string | null
          receiver_id: string
          sender_id: string
          status?: Database["public"]["Enums"]["transaction_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          expense_id?: string
          id?: string
          plan_id?: string
          public_id?: string | null
          receiver_id?: string
          sender_id?: string
          status?: Database["public"]["Enums"]["transaction_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "wallet_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auto_promote_waitlist_for_assigned: {
        Args: {
          p_plan_id: string
          p_vacated_group: Database["public"]["Enums"]["assigned_group_enum"]
        }
        Returns: number
      }
      auto_promote_waitlist_for_automatic: {
        Args: { p_plan_id: string }
        Returns: number
      }
      cancel_paid_plan_leave_request: {
        Args: { p_plan_id: string }
        Returns: Json
      }
      cancel_plan: { Args: { p_plan_id: string }; Returns: Json }
      complete_plan:
        | {
            Args: { p_attendance_input: Json; p_plan_id: string }
            Returns: Json
          }
        | {
            Args: {
              p_attendance_input: Json
              p_expense_mode?: string
              p_plan_id: string
            }
            Returns: Json
          }
      create_wallet_settlement: {
        Args: { p_amount: number; p_other_user_id: string; p_plan_id?: string }
        Returns: Json
      }
      delete_wallet_expense: { Args: { p_expense_id: string }; Returns: Json }
      delete_wallet_settlement: {
        Args: { p_settlement_id: string }
        Returns: Json
      }
      demote_from_host: {
        Args: { p_plan_id: string; p_target_user_id: string }
        Returns: Json
      }
      generate_discovery_public_id: { Args: never; Returns: string }
      generate_user_public_id: { Args: never; Returns: string }
      get_plan_participant_filtering: {
        Args: { p_plan_id: string }
        Returns: string
      }
      insert_cost_expense: {
        Args: {
          p_message_id?: string
          p_participant_ids?: string[]
          p_payer_id?: string
          p_plan_id: string
          p_title?: string
          p_total_amount?: number
        }
        Returns: string
      }
      invite_participants:
        | {
            Args: { p_invitee_user_ids: string[]; p_plan_id: string }
            Returns: Json
          }
        | {
            Args: {
              p_assigned_group?: Database["public"]["Enums"]["assigned_group_enum"]
              p_invitee_user_ids: string[]
              p_plan_id: string
            }
            Returns: Json
          }
      is_expense_participant: {
        Args: { p_expense_id: string; p_user_id: string }
        Returns: boolean
      }
      is_plan_host: {
        Args: { p_plan_id: string; p_user_id: string }
        Returns: boolean
      }
      is_wallet_expense_participant: {
        Args: { p_expense_id: string; p_user_id: string }
        Returns: boolean
      }
      leave_plan: { Args: { p_plan_id: string }; Returns: Json }
      manage_completed_plan_participants:
        | {
            Args: {
              p_expense_mode?: string
              p_plan_id: string
              p_users_to_add?: string[]
              p_users_to_remove?: string[]
            }
            Returns: Json
          }
        | {
            Args: {
              p_plan_id: string
              p_users_to_add: string[]
              p_users_to_remove: string[]
            }
            Returns: Json
          }
      move_participant_to_waitlist_and_decrease_capacity: {
        Args: { p_plan_id: string; p_target_user_id: string }
        Returns: Json
      }
      move_waitlist_to_going: {
        Args: { p_plan_id: string; p_target_user_id: string }
        Returns: Json
      }
      promote_to_host: {
        Args: { p_plan_id: string; p_target_user_id: string }
        Returns: Json
      }
      rebuild_waitlist_queue: {
        Args: { p_plan_id: string }
        Returns: undefined
      }
      recalculate_wallet_expenses: {
        Args: { p_plan_id: string }
        Returns: undefined
      }
      remove_and_replace_participant: {
        Args: {
          p_plan_id: string
          p_promote_user_id: string
          p_remove_user_id: string
        }
        Returns: Json
      }
      remove_expense_participant_and_redistribute:
        | {
            Args: { p_expense_id: string; p_participant_user_id: string }
            Returns: Json
          }
        | {
            Args: {
              p_expense_id: string
              p_participant_user_id: string
              p_strategy?: string
            }
            Returns: Json
          }
      remove_participant: {
        Args: { p_plan_id: string; p_target_user_id: string }
        Returns: Json
      }
      reorder_waitlist: {
        Args: { p_ordered_user_ids: string[]; p_plan_id: string }
        Returns: undefined
      }
      replace_participant: {
        Args: {
          p_plan_id: string
          p_replacement_user_id: string
          p_target_user_id: string
        }
        Returns: Json
      }
      request_paid_plan_leave: { Args: { p_plan_id: string }; Returns: Json }
      resolve_paid_plan_leave_request: {
        Args: {
          p_plan_id: string
          p_replacement_user_id?: string
          p_resolution: string
          p_target_user_id: string
        }
        Returns: Json
      }
      settle_wallet_expense: {
        Args: { p_debtor_id?: string; p_expense_id: string }
        Returns: Json
      }
      settle_wallet_relationship: {
        Args: { p_debtor_id: string }
        Returns: Json
      }
      swap_plan_participants: {
        Args: {
          p_going_user_id: string
          p_plan_id: string
          p_waitlist_user_id: string
        }
        Returns: Json
      }
      switch_to_automatic_waitlist_mode: {
        Args: { p_plan_id: string; p_promoted_user_ids?: string[] }
        Returns: undefined
      }
      transfer_circle_ownership: {
        Args: {
          p_circle_id: string
          p_new_host_id: string
          p_old_host_id: string
        }
        Returns: undefined
      }
      update_cost_expense: {
        Args: {
          p_expense_id: string
          p_participant_ids: string[]
          p_plan_id: string
          p_title: string
          p_total_amount: number
        }
        Returns: Json
      }
      update_plan_capacity: {
        Args: { p_max_participants: number; p_plan_id: string }
        Returns: Json
      }
    }
    Enums: {
      activity_category:
        | "SPORTS"
        | "MOVIES"
        | "DINING"
        | "ENTERTAINMENT"
        | "TRAVEL"
        | "FITNESS"
        | "STUDY"
        | "OTHER"
      activity_subcategory:
        | "FOOTBALL"
        | "BADMINTON"
        | "CRICKET"
        | "BASKETBALL"
        | "VOLLEYBALL"
        | "TENNIS"
        | "PICKLEBALL"
        | "BOWLING"
        | "GO_KARTING"
        | "MOVIE"
        | "RESTAURANT"
        | "CAFE"
        | "ROAD_TRIP"
        | "GYM"
        | "STUDY_SESSION"
        | "OTHER"
      assigned_group_enum: "GOING" | "WAITLIST"
      attendance_status: "ATTENDED" | "DID_NOT_ATTEND"
      circle_role: "creator_admin" | "admin" | "member"
      completion_status: "PENDING" | "SUBMITTED" | "VERIFIED"
      discovery_category:
        | "SPORTS"
        | "MOVIES"
        | "DINING"
        | "DRINKS"
        | "CUSTOM"
        | "QUICK_PLAN"
      discovery_status: "ACTIVE" | "INACTIVE" | "ARCHIVED"
      friendship_status: "PENDING" | "ACCEPTED"
      message_status: "SENT" | "DELIVERED"
      message_type: "text" | "system" | "poll" | "cost"
      notification_type:
        | "PLAN_INVITATION"
        | "PARTICIPANT_JOINED"
        | "PARTICIPANT_SKIPPED"
        | "PLAN_CANCELLED"
        | "PLAN_REMINDER"
        | "FRIEND_REQUEST"
        | "FRIEND_REQUEST_ACCEPTED"
        | "PAYMENT_RECEIVED"
        | "PAYMENT_REMINDER"
        | "MEMORY_GENERATED"
      participant_filtering_type: "AUTOMATIC" | "ASSIGNED"
      participant_payment_status: "PENDING" | "SETTLED"
      participant_role: "HOST" | "PARTICIPANT"
      plan_activity_type:
        | "participant_joined"
        | "participant_waitlisted"
        | "participant_skipped"
        | "participant_moved_to_joined"
        | "participant_moved_to_waitlist"
        | "participant_removed"
        | "participant_left"
        | "plan_datetime_changed"
        | "plan_created"
        | "plan_location_changed"
        | "participant_invites_toggled"
        | "participants_swapped"
        | "plan_changed"
        | "host_promoted"
      plan_status: "LIVE" | "COMPLETED" | "CANCELLED"
      rsvp_status: "INVITED" | "JOINED" | "SKIPPED" | "WAITLISTED" | "REJOINED"
      skip_reason: "LEFT" | "REMOVED" | "REPLACED" | "PAYMENT_KEPT" | "SKIPPED"
      system_message_type:
        | "plan_created"
        | "participant_joined"
        | "participant_left"
        | "title_changed"
        | "description_changed"
        | "date_changed"
        | "time_changed"
        | "venue_changed"
        | "plan_cancelled"
        | "plan_restored"
        | "plan_completed"
      team_type: "TEAM_1" | "TEAM_2"
      transaction_status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED"
      user_role: "user" | "admin"
      waitlist_order_mode_enum: "AUTO" | "CUSTOM"
      wallet_expense_status: "PENDING" | "SETTLED"
      wallet_expense_type: "PLAN_EXPENSE" | "ADDITIONAL_EXPENSE"
      wallet_status: "PENDING" | "PAID"
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
    Enums: {
      activity_category: [
        "SPORTS",
        "MOVIES",
        "DINING",
        "ENTERTAINMENT",
        "TRAVEL",
        "FITNESS",
        "STUDY",
        "OTHER",
      ],
      activity_subcategory: [
        "FOOTBALL",
        "BADMINTON",
        "CRICKET",
        "BASKETBALL",
        "VOLLEYBALL",
        "TENNIS",
        "PICKLEBALL",
        "BOWLING",
        "GO_KARTING",
        "MOVIE",
        "RESTAURANT",
        "CAFE",
        "ROAD_TRIP",
        "GYM",
        "STUDY_SESSION",
        "OTHER",
      ],
      assigned_group_enum: ["GOING", "WAITLIST"],
      attendance_status: ["ATTENDED", "DID_NOT_ATTEND"],
      circle_role: ["creator_admin", "admin", "member"],
      completion_status: ["PENDING", "SUBMITTED", "VERIFIED"],
      discovery_category: [
        "SPORTS",
        "MOVIES",
        "DINING",
        "DRINKS",
        "CUSTOM",
        "QUICK_PLAN",
      ],
      discovery_status: ["ACTIVE", "INACTIVE", "ARCHIVED"],
      friendship_status: ["PENDING", "ACCEPTED"],
      message_status: ["SENT", "DELIVERED"],
      message_type: ["text", "system", "poll", "cost"],
      notification_type: [
        "PLAN_INVITATION",
        "PARTICIPANT_JOINED",
        "PARTICIPANT_SKIPPED",
        "PLAN_CANCELLED",
        "PLAN_REMINDER",
        "FRIEND_REQUEST",
        "FRIEND_REQUEST_ACCEPTED",
        "PAYMENT_RECEIVED",
        "PAYMENT_REMINDER",
        "MEMORY_GENERATED",
      ],
      participant_filtering_type: ["AUTOMATIC", "ASSIGNED"],
      participant_payment_status: ["PENDING", "SETTLED"],
      participant_role: ["HOST", "PARTICIPANT"],
      plan_activity_type: [
        "participant_joined",
        "participant_waitlisted",
        "participant_skipped",
        "participant_moved_to_joined",
        "participant_moved_to_waitlist",
        "participant_removed",
        "participant_left",
        "plan_datetime_changed",
        "plan_created",
        "plan_location_changed",
        "participant_invites_toggled",
        "participants_swapped",
        "plan_changed",
        "host_promoted",
      ],
      plan_status: ["LIVE", "COMPLETED", "CANCELLED"],
      rsvp_status: ["INVITED", "JOINED", "SKIPPED", "WAITLISTED", "REJOINED"],
      skip_reason: ["LEFT", "REMOVED", "REPLACED", "PAYMENT_KEPT", "SKIPPED"],
      system_message_type: [
        "plan_created",
        "participant_joined",
        "participant_left",
        "title_changed",
        "description_changed",
        "date_changed",
        "time_changed",
        "venue_changed",
        "plan_cancelled",
        "plan_restored",
        "plan_completed",
      ],
      team_type: ["TEAM_1", "TEAM_2"],
      transaction_status: ["PENDING", "COMPLETED", "FAILED", "CANCELLED"],
      user_role: ["user", "admin"],
      waitlist_order_mode_enum: ["AUTO", "CUSTOM"],
      wallet_expense_status: ["PENDING", "SETTLED"],
      wallet_expense_type: ["PLAN_EXPENSE", "ADDITIONAL_EXPENSE"],
      wallet_status: ["PENDING", "PAID"],
    },
  },
} as const

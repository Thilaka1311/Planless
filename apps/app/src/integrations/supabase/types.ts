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
      circle_members: {
        Row: {
          auto_join_enabled: boolean
          auto_join_plans: boolean
          circle_id: string
          joined_at: string
          role: Database["public"]["Enums"]["circle_role"]
          user_id: string
        }
        Insert: {
          auto_join_enabled?: boolean
          auto_join_plans?: boolean
          circle_id: string
          joined_at?: string
          role?: Database["public"]["Enums"]["circle_role"]
          user_id: string
        }
        Update: {
          auto_join_enabled?: boolean
          auto_join_plans?: boolean
          circle_id?: string
          joined_at?: string
          role?: Database["public"]["Enums"]["circle_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "circle_members_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      circle_messages: {
        Row: {
          circle_id: string
          created_at: string
          id: string
          message: string
          sender_id: string
          status: Database["public"]["Enums"]["message_status"]
          updated_at: string
        }
        Insert: {
          circle_id: string
          created_at?: string
          id?: string
          message: string
          sender_id: string
          status?: Database["public"]["Enums"]["message_status"]
          updated_at?: string
        }
        Update: {
          circle_id?: string
          created_at?: string
          id?: string
          message?: string
          sender_id?: string
          status?: Database["public"]["Enums"]["message_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "circle_messages_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
        ]
      }
      circles: {
        Row: {
          allow_auto_join: boolean
          allow_member_edit: boolean
          allow_member_host: boolean
          allow_member_invite: boolean
          cover_image: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          public_id: string
          updated_at: string
        }
        Insert: {
          allow_auto_join?: boolean
          allow_member_edit?: boolean
          allow_member_host?: boolean
          allow_member_invite?: boolean
          cover_image?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name: string
          public_id: string
          updated_at?: string
        }
        Update: {
          allow_auto_join?: boolean
          allow_member_edit?: boolean
          allow_member_host?: boolean
          allow_member_invite?: boolean
          cover_image?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          public_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "circles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      completions: {
        Row: {
          completed_at: string | null
          created_at: string
          data: Json
          id: string
          plan_id: string
          status: Database["public"]["Enums"]["completion_status"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          data?: Json
          id?: string
          plan_id: string
          status?: Database["public"]["Enums"]["completion_status"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          data?: Json
          id?: string
          plan_id?: string
          status?: Database["public"]["Enums"]["completion_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "completions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_items: {
        Row: {
          category: Database["public"]["Enums"]["discovery_category"]
          cover_image_url: string | null
          created_at: string
          description: string | null
          display_order: number | null
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
          subcategory:
            | Database["public"]["Enums"]["discovery_subcategory"]
            | null
          title: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["discovery_category"]
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
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
          subcategory?:
            | Database["public"]["Enums"]["discovery_subcategory"]
            | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["discovery_category"]
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
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
          subcategory?:
            | Database["public"]["Enums"]["discovery_subcategory"]
            | null
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
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["discovery_category"]
          created_at?: string
          display_order?: number | null
          id?: string
          public_id: string
          status?: Database["public"]["Enums"]["discovery_status"]
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["discovery_category"]
          created_at?: string
          display_order?: number | null
          id?: string
          public_id?: string
          status?: Database["public"]["Enums"]["discovery_status"]
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
          category: string | null
          completion_id: string | null
          created_at: string
          id: string
          outcome_text: string | null
          plan_id: string | null
          scheduled_at: string | null
          status: string | null
          subcategory: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          category?: string | null
          completion_id?: string | null
          created_at?: string
          id?: string
          outcome_text?: string | null
          plan_id?: string | null
          scheduled_at?: string | null
          status?: string | null
          subcategory?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          category?: string | null
          completion_id?: string | null
          created_at?: string
          id?: string
          outcome_text?: string | null
          plan_id?: string | null
          scheduled_at?: string | null
          status?: string | null
          subcategory?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memories_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: true
            referencedRelation: "completions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memories_user_id_fkey"
            columns: ["user_id"]
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
      plan_participants: {
        Row: {
          circle_id: string | null
          cost_per_participant: number | null
          created_at: string
          delivery_status: string
          plan_id: string
          responded_at: string | null
          role: Database["public"]["Enums"]["participant_role"]
          rsvp_status: Database["public"]["Enums"]["rsvp_status"]
          skip_reason: Database["public"]["Enums"]["skip_reason"] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          circle_id?: string | null
          cost_per_participant?: number | null
          created_at?: string
          delivery_status?: string
          plan_id: string
          responded_at?: string | null
          role?: Database["public"]["Enums"]["participant_role"]
          rsvp_status?: Database["public"]["Enums"]["rsvp_status"]
          skip_reason?: Database["public"]["Enums"]["skip_reason"] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          circle_id?: string | null
          cost_per_participant?: number | null
          created_at?: string
          delivery_status?: string
          plan_id?: string
          responded_at?: string | null
          role?: Database["public"]["Enums"]["participant_role"]
          rsvp_status?: Database["public"]["Enums"]["rsvp_status"]
          skip_reason?: Database["public"]["Enums"]["skip_reason"] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_participants_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
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
      plan_teams: {
        Row: {
          created_at: string
          id: string
          name: string
          plan_id: string
          team: Database["public"]["Enums"]["team_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan_id: string
          team: Database["public"]["Enums"]["team_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan_id?: string
          team?: Database["public"]["Enums"]["team_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_teams_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          allow_participant_invites: boolean
          category: Database["public"]["Enums"]["activity_category"]
          circle_id: string | null
          cover_image: string | null
          created_at: string
          description: string

          host_id: string
          id: string
          latitude: number | null
          longitude: number | null
          max_participants: number | null
          place_address: string
          place_id: string | null
          place_name: string
          public_id: string
          rsvp_deadline: string
          scheduled_at: string
          status: Database["public"]["Enums"]["plan_status"]
          subcategory: Database["public"]["Enums"]["activity_subcategory"]
          title: string
          total_cost: number
          updated_at: string
        }
        Insert: {
          allow_participant_invites?: boolean
          category: Database["public"]["Enums"]["activity_category"]
          circle_id?: string | null
          cover_image?: string | null
          created_at?: string
          description?: string

          host_id: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          max_participants?: number | null
          place_address: string
          place_id?: string | null
          place_name: string
          public_id: string
          rsvp_deadline: string
          scheduled_at: string
          status?: Database["public"]["Enums"]["plan_status"]
          subcategory?: Database["public"]["Enums"]["activity_subcategory"]
          title: string
          total_cost?: number
          updated_at?: string
        }
        Update: {
          allow_participant_invites?: boolean
          category?: Database["public"]["Enums"]["activity_category"]
          circle_id?: string | null
          cover_image?: string | null
          created_at?: string
          description?: string

          host_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          max_participants?: number | null
          place_address?: string
          place_id?: string | null
          place_name?: string
          public_id?: string
          rsvp_deadline?: string
          scheduled_at?: string
          status?: Database["public"]["Enums"]["plan_status"]
          subcategory?: Database["public"]["Enums"]["activity_subcategory"]
          title?: string
          total_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          participant_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          participant_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          participant_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "plan_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          bio: string
          created_at: string
          full_name: string
          id: string
          profile_completed: boolean
          profile_photo_path: string | null
          public_id: string
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string
          username: string | null
        }
        Insert: {
          bio?: string
          created_at?: string
          full_name?: string
          id: string
          profile_completed?: boolean
          profile_photo_path?: string | null
          public_id: string
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          bio?: string
          created_at?: string
          full_name?: string
          id?: string
          profile_completed?: boolean
          profile_photo_path?: string | null
          public_id?: string
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      wallet_expenses: {
        Row: {
          circle_id: string | null
          cost_per_participant: number | null
          created_at: string
          id: string
          plan_id: string
          public_id: string
          receiver_id: string
          rsvp_status: Database["public"]["Enums"]["rsvp_status"] | null
          sender_id: string
          status: Database["public"]["Enums"]["wallet_expense_status"]
          updated_at: string
        }
        Insert: {
          circle_id?: string | null
          cost_per_participant?: number | null
          created_at?: string
          id?: string
          plan_id: string
          public_id: string
          receiver_id: string
          rsvp_status?: Database["public"]["Enums"]["rsvp_status"] | null
          sender_id: string
          status?: Database["public"]["Enums"]["wallet_expense_status"]
          updated_at?: string
        }
        Update: {
          circle_id?: string | null
          cost_per_participant?: number | null
          created_at?: string
          id?: string
          plan_id?: string
          public_id?: string
          receiver_id?: string
          rsvp_status?: Database["public"]["Enums"]["rsvp_status"] | null
          sender_id?: string
          status?: Database["public"]["Enums"]["wallet_expense_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_wallet_expenses_plan_participant"
            columns: ["plan_id", "sender_id"]
            isOneToOne: true
            referencedRelation: "plan_participants"
            referencedColumns: ["plan_id", "user_id"]
          },
          {
            foreignKeyName: "wallet_expenses_circle_id_fkey"
            columns: ["circle_id"]
            isOneToOne: false
            referencedRelation: "circles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_expenses_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_expenses_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_expenses_sender_id_fkey"
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
      generate_discovery_public_id: { Args: never; Returns: string }
      generate_user_public_id: { Args: never; Returns: string }
      transfer_circle_ownership: {
        Args: {
          p_circle_id: string
          p_new_host_id: string
          p_old_host_id: string
        }
        Returns: undefined
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
        | "FINE_DINE"
        | "PUB"
        | "ENGLISH"
        | "TAMIL"
        | "HINDI"
        | "OTHER"
      circle_role: "admin" | "member"
      completion_status: "PENDING" | "SUBMITTED" | "VERIFIED"
      dining_subcategory_enum: "CAFE" | "PUB" | "FINE_DINE"

      dining_type:
        | "CAFE"
        | "RESTAURANT"
        | "BREWERY"
        | "BUFFET"
        | "FAST_FOOD"
        | "DESSERT"
        | "FINE_DINING"
        | "STREET_FOOD"
      discovery_category:
        | "SPORTS"
        | "MOVIES"
        | "DINING"
        | "DRINKS"
        | "CUSTOM"
        | "QUICK_PLAN"
      discovery_status: "ACTIVE" | "INACTIVE" | "ARCHIVED"
      discovery_subcategory:
        | "FOOTBALL"
        | "BADMINTON"
        | "PICKLEBALL"
        | "ENGLISH"
        | "TAMIL"
        | "HINDI"
        | "CAFE"
        | "PUB"
        | "FINE_DINE"
      drinks_type:
        | "BAR"
        | "PUB"
        | "BREWERY"
        | "LOUNGE"
        | "COCKTAIL_BAR"
        | "WINE_BAR"
        | "CAFE"
      friendship_status: "PENDING" | "ACCEPTED"
      message_status: "SENT" | "DELIVERED"
      movie_genre:
        | "ACTION"
        | "COMEDY"
        | "DRAMA"
        | "THRILLER"
        | "HORROR"
        | "ROMANCE"
        | "SCI_FI"
        | "ANIMATION"
        | "DOCUMENTARY"
      movies_subcategory_enum: "ENGLISH" | "TAMIL" | "HINDI"
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
      participant_role: "HOST" | "CO_HOST" | "PARTICIPANT"
      plan_status: "LIVE" | "COMPLETED" | "CANCELLED"
      rsvp_status: "INVITED" | "JOINED" | "SKIPPED" | "WAITLISTED"
      skip_reason: "LEFT" | "REMOVED"
      sports_subcategory:
        | "FOOTBALL"
        | "BADMINTON"
        | "CRICKET"
        | "BASKETBALL"
        | "TENNIS"
        | "PICKLEBALL"
        | "VOLLEYBALL"
        | "TABLE_TENNIS"
      sports_subcategory_enum: "FOOTBALL" | "BADMINTON" | "PICKLEBALL"
      team_type: "TEAM_1" | "TEAM_2"
      user_role: "user" | "admin"

      wallet_expense_status: "PENDING" | "SETTLED"
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
        "FINE_DINE",
        "PUB",
        "ENGLISH",
        "TAMIL",
        "HINDI",
        "OTHER",
      ],
      circle_role: ["admin", "member"],
      completion_status: ["PENDING", "SUBMITTED", "VERIFIED"],
      dining_subcategory_enum: ["CAFE", "PUB", "FINE_DINE"],
      dining_type: [
        "CAFE",
        "RESTAURANT",
        "BREWERY",
        "BUFFET",
        "FAST_FOOD",
        "DESSERT",
        "FINE_DINING",
        "STREET_FOOD",
      ],
      discovery_category: [
        "SPORTS",
        "MOVIES",
        "DINING",
        "DRINKS",
        "CUSTOM",
        "QUICK_PLAN",
      ],
      discovery_status: ["ACTIVE", "INACTIVE", "ARCHIVED"],
      discovery_subcategory: [
        "FOOTBALL",
        "BADMINTON",
        "PICKLEBALL",
        "ENGLISH",
        "TAMIL",
        "HINDI",
        "CAFE",
        "PUB",
        "FINE_DINE",
      ],
      drinks_type: [
        "BAR",
        "PUB",
        "BREWERY",
        "LOUNGE",
        "COCKTAIL_BAR",
        "WINE_BAR",
        "CAFE",
      ],

      friendship_status: ["PENDING", "ACCEPTED"],
      message_status: ["SENT", "DELIVERED"],
      movie_genre: [
        "ACTION",
        "COMEDY",
        "DRAMA",
        "THRILLER",
        "HORROR",
        "ROMANCE",
        "SCI_FI",
        "ANIMATION",
        "DOCUMENTARY",
      ],
      movies_subcategory_enum: ["ENGLISH", "TAMIL", "HINDI"],
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
      participant_role: ["HOST", "CO_HOST", "PARTICIPANT"],
      plan_status: ["LIVE", "COMPLETED", "CANCELLED"],
      rsvp_status: ["INVITED", "JOINED", "SKIPPED", "WAITLISTED"],
      skip_reason: ["LEFT", "REMOVED"],
      sports_subcategory: [
        "FOOTBALL",
        "BADMINTON",
        "CRICKET",
        "BASKETBALL",
        "TENNIS",
        "PICKLEBALL",
        "VOLLEYBALL",
        "TABLE_TENNIS",
      ],
      sports_subcategory_enum: ["FOOTBALL", "BADMINTON", "PICKLEBALL"],
      team_type: ["TEAM_1", "TEAM_2"],
      user_role: ["user", "admin"],
      wallet_expense_status: ["PENDING", "SETTLED"],
      wallet_status: ["PENDING", "PAID"],

    },
  },
} as const

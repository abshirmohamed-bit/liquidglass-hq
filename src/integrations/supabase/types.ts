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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      analytics_snapshots: {
        Row: {
          client_id: string
          date: string | null
          id: string
          impressions_ctr: number | null
          subscribers: number | null
          top_videos: Json | null
          views: number | null
          watch_hours: number | null
        }
        Insert: {
          client_id: string
          date?: string | null
          id?: string
          impressions_ctr?: number | null
          subscribers?: number | null
          top_videos?: Json | null
          views?: number | null
          watch_hours?: number | null
        }
        Update: {
          client_id?: string
          date?: string | null
          id?: string
          impressions_ctr?: number | null
          subscribers?: number | null
          top_videos?: Json | null
          views?: number | null
          watch_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_snapshots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          id: string
          key: string
          owner_id: string
          value: string | null
        }
        Insert: {
          id?: string
          key: string
          owner_id?: string
          value?: string | null
        }
        Update: {
          id?: string
          key?: string
          owner_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_progress: {
        Row: {
          client_id: string
          id: string
          notes: string | null
          source: string | null
          stage: string | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          id?: string
          notes?: string | null
          source?: string | null
          stage?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          id?: string
          notes?: string | null
          source?: string | null
          stage?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_progress_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          channel_summary: string | null
          channel_thumbnail: string | null
          channel_url: string | null
          content_strategy: string | null
          custom_plan_label: string | null
          discord_server_id: string | null
          google_account_email: string | null
          id: string
          monthly_fee: number | null
          name: string
          notes: string | null
          offers: string | null
          owner_id: string
          plan_type: string | null
          setup_fee: number
          start_date: string | null
          status: string
        }
        Insert: {
          channel_summary?: string | null
          channel_thumbnail?: string | null
          channel_url?: string | null
          content_strategy?: string | null
          custom_plan_label?: string | null
          discord_server_id?: string | null
          google_account_email?: string | null
          id?: string
          monthly_fee?: number | null
          name: string
          notes?: string | null
          offers?: string | null
          owner_id?: string
          plan_type?: string | null
          setup_fee?: number
          start_date?: string | null
          status?: string
        }
        Update: {
          channel_summary?: string | null
          channel_thumbnail?: string | null
          channel_url?: string | null
          content_strategy?: string | null
          custom_plan_label?: string | null
          discord_server_id?: string | null
          google_account_email?: string | null
          id?: string
          monthly_fee?: number | null
          name?: string
          notes?: string | null
          offers?: string | null
          owner_id?: string
          plan_type?: string | null
          setup_fee?: number
          start_date?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ideation_messages: {
        Row: {
          content: string | null
          id: string
          parts: Json | null
          role: string | null
          sdk_message_id: string | null
          thread_id: string
          timestamp: string | null
        }
        Insert: {
          content?: string | null
          id?: string
          parts?: Json | null
          role?: string | null
          sdk_message_id?: string | null
          thread_id: string
          timestamp?: string | null
        }
        Update: {
          content?: string | null
          id?: string
          parts?: Json | null
          role?: string | null
          sdk_message_id?: string | null
          thread_id?: string
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ideation_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ideation_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ideation_threads: {
        Row: {
          ai_block_reason: string | null
          client_id: string | null
          created_at: string | null
          id: string
          owner_id: string
          title: string
        }
        Insert: {
          ai_block_reason?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          owner_id?: string
          title: string
        }
        Update: {
          ai_block_reason?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          owner_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ideation_threads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ideation_threads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_entries: {
        Row: {
          client_id: string | null
          id: string
          learned_principle: string | null
          owner_id: string
          scope: string | null
          timestamp: string | null
          user_input: string | null
        }
        Insert: {
          client_id?: string | null
          id?: string
          learned_principle?: string | null
          owner_id?: string
          scope?: string | null
          timestamp?: string | null
          user_input?: string | null
        }
        Update: {
          client_id?: string | null
          id?: string
          learned_principle?: string | null
          owner_id?: string
          scope?: string | null
          timestamp?: string | null
          user_input?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_entries_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          channel_url: string | null
          id: string
          monthly_recurring: number | null
          name: string
          notes: string | null
          owner_id: string
          status: string | null
          upfront_cash: number | null
        }
        Insert: {
          channel_url?: string | null
          id?: string
          monthly_recurring?: number | null
          name: string
          notes?: string | null
          owner_id?: string
          status?: string | null
          upfront_cash?: number | null
        }
        Update: {
          channel_url?: string | null
          id?: string
          monthly_recurring?: number | null
          name?: string
          notes?: string | null
          owner_id?: string
          status?: string | null
          upfront_cash?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          due_date: string | null
          id: string
          paid_date: string | null
          status: string | null
          type: string
        }
        Insert: {
          amount: number
          client_id: string
          due_date?: string | null
          id?: string
          paid_date?: string | null
          status?: string | null
          type: string
        }
        Update: {
          amount?: number
          client_id?: string
          due_date?: string | null
          id?: string
          paid_date?: string | null
          status?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          id: string
          preferences: Json
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          id: string
          preferences?: Json
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string
          preferences?: Json
        }
        Relationships: []
      }
      team_members: {
        Row: {
          client_id: string
          cost: number | null
          id: string
          name: string
          role: string | null
        }
        Insert: {
          client_id: string
          cost?: number | null
          id?: string
          name: string
          role?: string | null
        }
        Update: {
          client_id?: string
          cost?: number | null
          id?: string
          name?: string
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      thumbnail_messages: {
        Row: {
          content: string | null
          id: string
          image_url: string | null
          rating: number | null
          role: string | null
          session_id: string
          timestamp: string | null
        }
        Insert: {
          content?: string | null
          id?: string
          image_url?: string | null
          rating?: number | null
          role?: string | null
          session_id: string
          timestamp?: string | null
        }
        Update: {
          content?: string | null
          id?: string
          image_url?: string | null
          rating?: number | null
          role?: string | null
          session_id?: string
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "thumbnail_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "thumbnail_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      thumbnail_sessions: {
        Row: {
          client_id: string
          created_at: string | null
          id: string
          title: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          id?: string
          title?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          id?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "thumbnail_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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

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
      assets: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string
          duration_ms: number | null
          engine_asset_id: string | null
          error: string | null
          id: string
          is_default: boolean
          license: string | null
          name: string
          owner_id: string
          size_bytes: number | null
          source: string | null
          status: string
          tags: Json
          trashed_at: string | null
          type: string
          url: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by?: string
          duration_ms?: number | null
          engine_asset_id?: string | null
          error?: string | null
          id?: string
          is_default?: boolean
          license?: string | null
          name: string
          owner_id?: string
          size_bytes?: number | null
          source?: string | null
          status?: string
          tags?: Json
          trashed_at?: string | null
          type: string
          url?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string
          duration_ms?: number | null
          engine_asset_id?: string | null
          error?: string | null
          id?: string
          is_default?: boolean
          license?: string | null
          name?: string
          owner_id?: string
          size_bytes?: number | null
          source?: string | null
          status?: string
          tags?: Json
          trashed_at?: string | null
          type?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          details: Json | null
          entity: string | null
          entity_id: string | null
          id: string
          owner_id: string
          timestamp: string
          user_id: string | null
        }
        Insert: {
          action: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          owner_id?: string
          timestamp?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          details?: Json | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          owner_id?: string
          timestamp?: string
          user_id?: string | null
        }
        Relationships: []
      }
      brand_kits: {
        Row: {
          ai_toggles: Json | null
          banned_words: string | null
          caption_style: Json | null
          caption_style_id: string | null
          censored_words: string | null
          colors: Json | null
          copy_defaults: Json | null
          created_at: string
          cta_overlay_text: string | null
          default_aspect: string | null
          default_layout: string | null
          end_card: boolean
          font_asset_ids: Json | null
          handle: string | null
          id: string
          intro_asset_id: string | null
          logo_asset_id: string | null
          music_asset_id: string | null
          outro_asset_id: string | null
          owner_id: string
          proper_nouns: string | null
          tone: string | null
          user_id: string
        }
        Insert: {
          ai_toggles?: Json | null
          banned_words?: string | null
          caption_style?: Json | null
          caption_style_id?: string | null
          censored_words?: string | null
          colors?: Json | null
          copy_defaults?: Json | null
          created_at?: string
          cta_overlay_text?: string | null
          default_aspect?: string | null
          default_layout?: string | null
          end_card?: boolean
          font_asset_ids?: Json | null
          handle?: string | null
          id?: string
          intro_asset_id?: string | null
          logo_asset_id?: string | null
          music_asset_id?: string | null
          outro_asset_id?: string | null
          owner_id?: string
          proper_nouns?: string | null
          tone?: string | null
          user_id?: string
        }
        Update: {
          ai_toggles?: Json | null
          banned_words?: string | null
          caption_style?: Json | null
          caption_style_id?: string | null
          censored_words?: string | null
          colors?: Json | null
          copy_defaults?: Json | null
          created_at?: string
          cta_overlay_text?: string | null
          default_aspect?: string | null
          default_layout?: string | null
          end_card?: boolean
          font_asset_ids?: Json | null
          handle?: string | null
          id?: string
          intro_asset_id?: string | null
          logo_asset_id?: string | null
          music_asset_id?: string | null
          outro_asset_id?: string | null
          owner_id?: string
          proper_nouns?: string | null
          tone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      campaign_memberships: {
        Row: {
          campaign_id: string
          clipper: string
          id: string
          joined_at: string
          owner_id: string
          status: string
        }
        Insert: {
          campaign_id: string
          clipper?: string
          id?: string
          joined_at?: string
          owner_id?: string
          status?: string
        }
        Update: {
          campaign_id?: string
          clipper?: string
          id?: string
          joined_at?: string
          owner_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_memberships_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          brief: string | null
          client_id: string
          created_at: string
          created_by: string
          deadline: string | null
          id: string
          owner_id: string
          pay_terms: string | null
          platforms: Json
          posting_time: string | null
          rate_per_thousand_views: number | null
          rules: string | null
          source_assets: Json
          status: string
          title: string
        }
        Insert: {
          brief?: string | null
          client_id: string
          created_at?: string
          created_by?: string
          deadline?: string | null
          id?: string
          owner_id?: string
          pay_terms?: string | null
          platforms?: Json
          posting_time?: string | null
          rate_per_thousand_views?: number | null
          rules?: string | null
          source_assets?: Json
          status?: string
          title: string
        }
        Update: {
          brief?: string | null
          client_id?: string
          created_at?: string
          created_by?: string
          deadline?: string | null
          id?: string
          owner_id?: string
          pay_terms?: string | null
          platforms?: Json
          posting_time?: string | null
          rate_per_thousand_views?: number | null
          rules?: string | null
          source_assets?: Json
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_credentials: {
        Row: {
          access_token: string | null
          channel_id: string
          expires_at: string | null
          id: string
          provider: string | null
          refresh_token: string | null
        }
        Insert: {
          access_token?: string | null
          channel_id: string
          expires_at?: string | null
          id?: string
          provider?: string | null
          refresh_token?: string | null
        }
        Update: {
          access_token?: string | null
          channel_id?: string
          expires_at?: string | null
          id?: string
          provider?: string | null
          refresh_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_credentials_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          connected_at: string | null
          created_at: string
          external_account_id: string | null
          handle: string | null
          id: string
          last_error: string | null
          owner_id: string
          platform: string
          privacy_default: string | null
          scopes: string | null
          status: string
          tiktok_target: string | null
          user_id: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          external_account_id?: string | null
          handle?: string | null
          id?: string
          last_error?: string | null
          owner_id?: string
          platform: string
          privacy_default?: string | null
          scopes?: string | null
          status?: string
          tiktok_target?: string | null
          user_id?: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          external_account_id?: string | null
          handle?: string | null
          id?: string
          last_error?: string | null
          owner_id?: string
          platform?: string
          privacy_default?: string | null
          scopes?: string | null
          status?: string
          tiktok_target?: string | null
          user_id?: string
        }
        Relationships: []
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
      client_suggestions: {
        Row: {
          client_id: string
          content: Json
          generated_at: string
          id: string
          kind: string
          owner_id: string
        }
        Insert: {
          client_id: string
          content: Json
          generated_at?: string
          id?: string
          kind: string
          owner_id?: string
        }
        Update: {
          client_id?: string
          content?: Json
          generated_at?: string
          id?: string
          kind?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_suggestions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_suggestions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      clip_jobs: {
        Row: {
          alternates: boolean
          aspect: string | null
          broll_asset_id: string | null
          caption_language: string | null
          caption_style_id: string | null
          clip_count: Json | null
          clip_length: Json | null
          coverage: string
          created_at: string
          created_by: string
          edit_level: string | null
          edits: Json | null
          engine: string
          engine_job_id: string | null
          error: string | null
          formats: Json | null
          framing: string | null
          genre: string | null
          headline_top_n: number | null
          id: string
          language: string | null
          last_event_id: string | null
          mode: string
          music_asset_id: string | null
          must_include: Json | null
          owner_id: string
          processing_seconds: number | null
          progress: number | null
          prompt: string | null
          range_end_ms: number | null
          range_start_ms: number | null
          source_asset_id: string
          stage: string | null
          status: string
          suggested_count: number | null
        }
        Insert: {
          alternates?: boolean
          aspect?: string | null
          broll_asset_id?: string | null
          caption_language?: string | null
          caption_style_id?: string | null
          clip_count?: Json | null
          clip_length?: Json | null
          coverage?: string
          created_at?: string
          created_by?: string
          edit_level?: string | null
          edits?: Json | null
          engine?: string
          engine_job_id?: string | null
          error?: string | null
          formats?: Json | null
          framing?: string | null
          genre?: string | null
          headline_top_n?: number | null
          id?: string
          language?: string | null
          last_event_id?: string | null
          mode?: string
          music_asset_id?: string | null
          must_include?: Json | null
          owner_id?: string
          processing_seconds?: number | null
          progress?: number | null
          prompt?: string | null
          range_end_ms?: number | null
          range_start_ms?: number | null
          source_asset_id: string
          stage?: string | null
          status?: string
          suggested_count?: number | null
        }
        Update: {
          alternates?: boolean
          aspect?: string | null
          broll_asset_id?: string | null
          caption_language?: string | null
          caption_style_id?: string | null
          clip_count?: Json | null
          clip_length?: Json | null
          coverage?: string
          created_at?: string
          created_by?: string
          edit_level?: string | null
          edits?: Json | null
          engine?: string
          engine_job_id?: string | null
          error?: string | null
          formats?: Json | null
          framing?: string | null
          genre?: string | null
          headline_top_n?: number | null
          id?: string
          language?: string | null
          last_event_id?: string | null
          mode?: string
          music_asset_id?: string | null
          must_include?: Json | null
          owner_id?: string
          processing_seconds?: number | null
          progress?: number | null
          prompt?: string | null
          range_end_ms?: number | null
          range_start_ms?: number | null
          source_asset_id?: string
          stage?: string | null
          status?: string
          suggested_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clip_jobs_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "source_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      clips: {
        Row: {
          alternate_of: string | null
          aspect: string | null
          assignee: string | null
          audio_tracks: Json | null
          background: Json | null
          campaign_id: string | null
          caption_language: string | null
          caption_options: Json | null
          caption_style: Json | null
          caption_style_id: string | null
          captions: Json | null
          copy: Json | null
          created_at: string
          created_by: string
          cuts: Json | null
          disliked: boolean
          dub_asset_url: string | null
          dub_language: string | null
          duration_ms: number | null
          edits: Json | null
          end_ms: number | null
          engine_export_id: string | null
          engine_project_id: string | null
          error: string | null
          favorite: boolean
          format_id: string | null
          framing: Json | null
          height: number | null
          id: string
          index: number | null
          intensity: string | null
          job_id: string | null
          last_event_id: string | null
          layout: string | null
          one_click_preset: string | null
          overlays: Json | null
          owner_id: string
          reason: string | null
          render_job_id: string | null
          resolution: string | null
          scene_analysis: string | null
          score: number | null
          score_breakdown: Json | null
          share_token: string | null
          size_bytes: number | null
          source_asset_id: string | null
          start_ms: number | null
          status: string
          style_preset: string | null
          submission_id: string | null
          thumbnail_url: string | null
          title: string | null
          title_style: string | null
          title_text: string | null
          video_url: string | null
          watermark_text: string | null
          watermark_url: string | null
          width: number | null
        }
        Insert: {
          alternate_of?: string | null
          aspect?: string | null
          assignee?: string | null
          audio_tracks?: Json | null
          background?: Json | null
          campaign_id?: string | null
          caption_language?: string | null
          caption_options?: Json | null
          caption_style?: Json | null
          caption_style_id?: string | null
          captions?: Json | null
          copy?: Json | null
          created_at?: string
          created_by?: string
          cuts?: Json | null
          disliked?: boolean
          dub_asset_url?: string | null
          dub_language?: string | null
          duration_ms?: number | null
          edits?: Json | null
          end_ms?: number | null
          engine_export_id?: string | null
          engine_project_id?: string | null
          error?: string | null
          favorite?: boolean
          format_id?: string | null
          framing?: Json | null
          height?: number | null
          id?: string
          index?: number | null
          intensity?: string | null
          job_id?: string | null
          last_event_id?: string | null
          layout?: string | null
          one_click_preset?: string | null
          overlays?: Json | null
          owner_id?: string
          reason?: string | null
          render_job_id?: string | null
          resolution?: string | null
          scene_analysis?: string | null
          score?: number | null
          score_breakdown?: Json | null
          share_token?: string | null
          size_bytes?: number | null
          source_asset_id?: string | null
          start_ms?: number | null
          status?: string
          style_preset?: string | null
          submission_id?: string | null
          thumbnail_url?: string | null
          title?: string | null
          title_style?: string | null
          title_text?: string | null
          video_url?: string | null
          watermark_text?: string | null
          watermark_url?: string | null
          width?: number | null
        }
        Update: {
          alternate_of?: string | null
          aspect?: string | null
          assignee?: string | null
          audio_tracks?: Json | null
          background?: Json | null
          campaign_id?: string | null
          caption_language?: string | null
          caption_options?: Json | null
          caption_style?: Json | null
          caption_style_id?: string | null
          captions?: Json | null
          copy?: Json | null
          created_at?: string
          created_by?: string
          cuts?: Json | null
          disliked?: boolean
          dub_asset_url?: string | null
          dub_language?: string | null
          duration_ms?: number | null
          edits?: Json | null
          end_ms?: number | null
          engine_export_id?: string | null
          engine_project_id?: string | null
          error?: string | null
          favorite?: boolean
          format_id?: string | null
          framing?: Json | null
          height?: number | null
          id?: string
          index?: number | null
          intensity?: string | null
          job_id?: string | null
          last_event_id?: string | null
          layout?: string | null
          one_click_preset?: string | null
          overlays?: Json | null
          owner_id?: string
          reason?: string | null
          render_job_id?: string | null
          resolution?: string | null
          scene_analysis?: string | null
          score?: number | null
          score_breakdown?: Json | null
          share_token?: string | null
          size_bytes?: number | null
          source_asset_id?: string | null
          start_ms?: number | null
          status?: string
          style_preset?: string | null
          submission_id?: string | null
          thumbnail_url?: string | null
          title?: string | null
          title_style?: string | null
          title_text?: string | null
          video_url?: string | null
          watermark_text?: string | null
          watermark_url?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clips_alternate_of_fkey"
            columns: ["alternate_of"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clips_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clips_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clips_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "clip_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clips_render_job_id_fkey"
            columns: ["render_job_id"]
            isOneToOne: false
            referencedRelation: "render_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clips_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "source_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clips_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_objectives: {
        Row: {
          created_at: string
          day: string
          done: boolean
          id: string
          owner_id: string
          text: string
        }
        Insert: {
          created_at?: string
          day?: string
          done?: boolean
          id?: string
          owner_id?: string
          text: string
        }
        Update: {
          created_at?: string
          day?: string
          done?: boolean
          id?: string
          owner_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_objectives_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      formats: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          inputs: Json | null
          key: string
          name: string
          owner_id: string
          recipe: Json | null
          thumbnail_url: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          inputs?: Json | null
          key: string
          name: string
          owner_id?: string
          recipe?: Json | null
          thumbnail_url?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          inputs?: Json | null
          key?: string
          name?: string
          owner_id?: string
          recipe?: Json | null
          thumbnail_url?: string | null
        }
        Relationships: []
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
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          owner_id: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          owner_id?: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          owner_id?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
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
      post_metrics: {
        Row: {
          comments: number | null
          fetched_at: string
          id: string
          likes: number | null
          post_id: string
          shares: number | null
          views: number | null
        }
        Insert: {
          comments?: number | null
          fetched_at?: string
          id?: string
          likes?: number | null
          post_id: string
          shares?: number | null
          views?: number | null
        }
        Update: {
          comments?: number | null
          fetched_at?: string
          id?: string
          likes?: number | null
          post_id?: string
          shares?: number | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_metrics_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          attempts: number
          caption: string | null
          channel_id: string | null
          clip_id: string
          cover_time_ms: number | null
          created_at: string
          created_by: string
          external_post_id: string | null
          hashtags: Json
          id: string
          include_source_link: boolean
          last_error: string | null
          mode: string
          owner_id: string
          platform: string | null
          post_url: string | null
          posted_at: string | null
          privacy: string | null
          scheduled_at: string | null
          status: string
          title: string | null
        }
        Insert: {
          attempts?: number
          caption?: string | null
          channel_id?: string | null
          clip_id: string
          cover_time_ms?: number | null
          created_at?: string
          created_by?: string
          external_post_id?: string | null
          hashtags?: Json
          id?: string
          include_source_link?: boolean
          last_error?: string | null
          mode?: string
          owner_id?: string
          platform?: string | null
          post_url?: string | null
          posted_at?: string | null
          privacy?: string | null
          scheduled_at?: string | null
          status?: string
          title?: string | null
        }
        Update: {
          attempts?: number
          caption?: string | null
          channel_id?: string | null
          clip_id?: string
          cover_time_ms?: number | null
          created_at?: string
          created_by?: string
          external_post_id?: string | null
          hashtags?: Json
          id?: string
          include_source_link?: boolean
          last_error?: string | null
          mode?: string
          owner_id?: string
          platform?: string | null
          post_url?: string | null
          posted_at?: string | null
          privacy?: string | null
          scheduled_at?: string | null
          status?: string
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
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
      render_jobs: {
        Row: {
          clip_id: string | null
          created_at: string
          created_by: string
          duration_ms: number | null
          engine_render_id: string | null
          error: string | null
          format_id: string
          id: string
          inputs: Json | null
          output_url: string | null
          owner_id: string
          source_asset_id: string | null
          status: string
        }
        Insert: {
          clip_id?: string | null
          created_at?: string
          created_by?: string
          duration_ms?: number | null
          engine_render_id?: string | null
          error?: string | null
          format_id: string
          id?: string
          inputs?: Json | null
          output_url?: string | null
          owner_id?: string
          source_asset_id?: string | null
          status?: string
        }
        Update: {
          clip_id?: string | null
          created_at?: string
          created_by?: string
          duration_ms?: number | null
          engine_render_id?: string | null
          error?: string | null
          format_id?: string
          id?: string
          inputs?: Json | null
          output_url?: string | null
          owner_id?: string
          source_asset_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_jobs_format_id_fkey"
            columns: ["format_id"]
            isOneToOne: false
            referencedRelation: "formats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_jobs_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "source_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      source_assets: {
        Row: {
          campaign_id: string | null
          client_id: string | null
          created_at: string
          created_by: string
          duration_ms: number | null
          engine_asset_id: string | null
          error: string | null
          fps: number | null
          height: number | null
          id: string
          kind: string
          name: string
          niche: string | null
          owner_id: string
          public_url: string | null
          quality_warning: boolean
          size_bytes: number | null
          source_height: number | null
          source_url: string | null
          status: string
          subtitle_file_url: string | null
          thumbnail_url: string | null
          transcript: Json | null
          transcript_status: string
          trashed_at: string | null
          width: number | null
        }
        Insert: {
          campaign_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          duration_ms?: number | null
          engine_asset_id?: string | null
          error?: string | null
          fps?: number | null
          height?: number | null
          id?: string
          kind: string
          name: string
          niche?: string | null
          owner_id?: string
          public_url?: string | null
          quality_warning?: boolean
          size_bytes?: number | null
          source_height?: number | null
          source_url?: string | null
          status?: string
          subtitle_file_url?: string | null
          thumbnail_url?: string | null
          transcript?: Json | null
          transcript_status?: string
          trashed_at?: string | null
          width?: number | null
        }
        Update: {
          campaign_id?: string | null
          client_id?: string | null
          created_at?: string
          created_by?: string
          duration_ms?: number | null
          engine_asset_id?: string | null
          error?: string | null
          fps?: number | null
          height?: number | null
          id?: string
          kind?: string
          name?: string
          niche?: string | null
          owner_id?: string
          public_url?: string | null
          quality_warning?: boolean
          size_bytes?: number | null
          source_height?: number | null
          source_url?: string | null
          status?: string
          subtitle_file_url?: string | null
          thumbnail_url?: string | null
          transcript?: Json | null
          transcript_status?: string
          trashed_at?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "source_assets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          campaign_id: string
          clip_id: string
          clipper: string
          created_at: string
          id: string
          note: string | null
          owner_id: string
          post_ids: Json
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_comment: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          clip_id: string
          clipper?: string
          created_at?: string
          id?: string
          note?: string | null
          owner_id?: string
          post_ids?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_comment?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          clip_id?: string
          clipper?: string
          created_at?: string
          id?: string
          note?: string | null
          owner_id?: string
          post_ids?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_comment?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_clip_id_fkey"
            columns: ["clip_id"]
            isOneToOne: false
            referencedRelation: "clips"
            referencedColumns: ["id"]
          },
        ]
      }
      team_logins: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          owner_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          owner_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          owner_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_logins_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_logins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      user_roles: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_client_id_fkey"
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
      campaign_client: { Args: { _campaign: string }; Returns: string }
      campaign_open: { Args: { _campaign: string }; Returns: boolean }
      clip_client: { Args: { _clip: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_campaign_member: {
        Args: { _campaign: string; _uid: string }
        Returns: boolean
      }
      my_client: { Args: { _user_id: string }; Returns: string }
      workspace_of: { Args: { _uid: string }; Returns: string }
      ws_admin: { Args: { _owner: string }; Returns: boolean }
    }
    Enums: {
      app_role: "ADMIN" | "CLIENT" | "CLIPPER"
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
    Enums: {
      app_role: ["ADMIN", "CLIENT", "CLIPPER"],
    },
  },
} as const

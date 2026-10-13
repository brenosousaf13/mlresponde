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
      admin_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json
          id: number
          ip: string | null
          organization_id: string | null
          summary: string
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          ip?: string | null
          organization_id?: string | null
          summary?: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          ip?: string | null
          organization_id?: string | null
          summary?: string
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_organization_notes: {
        Row: {
          notes: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          notes?: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          notes?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_organization_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      after_sale_examples: {
        Row: {
          answer_text: string
          buyer_message: string
          created_at: string
          created_by: string | null
          id: string
          ml_account_id: string
          organization_id: string
          source_conversation_id: string | null
        }
        Insert: {
          answer_text: string
          buyer_message: string
          created_at?: string
          created_by?: string | null
          id?: string
          ml_account_id: string
          organization_id: string
          source_conversation_id?: string | null
        }
        Update: {
          answer_text?: string
          buyer_message?: string
          created_at?: string
          created_by?: string | null
          id?: string
          ml_account_id?: string
          organization_id?: string
          source_conversation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "after_sale_examples_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "ml_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "after_sale_examples_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "after_sale_examples_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "ml_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_examples: {
        Row: {
          answer_text: string
          created_at: string
          created_by: string | null
          id: string
          item_id: string | null
          item_title: string | null
          ml_account_id: string
          organization_id: string
          question_text: string
          source_question_id: string | null
          updated_at: string
        }
        Insert: {
          answer_text: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string | null
          item_title?: string | null
          ml_account_id: string
          organization_id: string
          question_text: string
          source_question_id?: string | null
          updated_at?: string
        }
        Update: {
          answer_text?: string
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string | null
          item_title?: string | null
          ml_account_id?: string
          organization_id?: string
          question_text?: string
          source_question_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_examples_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "ml_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_examples_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_examples_source_question_id_fkey"
            columns: ["source_question_id"]
            isOneToOne: false
            referencedRelation: "ml_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_keys: {
        Row: {
          activated_at: string | null
          created_at: string
          created_by: string | null
          disabled_at: string | null
          disabled_reason: string | null
          id: string
          key_ciphertext: string
          key_fingerprint: string
          key_hint: string
          label: string
          last_check_error: string | null
          last_check_ok: boolean | null
          last_checked_at: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          disabled_reason?: string | null
          id: string
          key_ciphertext: string
          key_fingerprint: string
          key_hint: string
          label: string
          last_check_error?: string | null
          last_check_ok?: boolean | null
          last_checked_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          created_by?: string | null
          disabled_at?: string | null
          disabled_reason?: string | null
          id?: string
          key_ciphertext?: string
          key_fingerprint?: string
          key_hint?: string
          label?: string
          last_check_error?: string | null
          last_check_ok?: boolean | null
          last_checked_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_events: {
        Row: {
          ai_key_id: string | null
          cached_input_tokens: number
          conversation_id: string | null
          cost_usd: number
          created_at: string
          error: string | null
          feature: string
          id: number
          input_tokens: number
          key_source: string | null
          latency_ms: number | null
          ml_account_id: string | null
          model: string
          organization_id: string | null
          output_tokens: number
          question_id: string | null
          reasoning_tokens: number
          success: boolean
          total_tokens: number
        }
        Insert: {
          ai_key_id?: string | null
          cached_input_tokens?: number
          conversation_id?: string | null
          cost_usd?: number
          created_at?: string
          error?: string | null
          feature: string
          id?: never
          input_tokens?: number
          key_source?: string | null
          latency_ms?: number | null
          ml_account_id?: string | null
          model: string
          organization_id?: string | null
          output_tokens?: number
          question_id?: string | null
          reasoning_tokens?: number
          success?: boolean
          total_tokens?: number
        }
        Update: {
          ai_key_id?: string | null
          cached_input_tokens?: number
          conversation_id?: string | null
          cost_usd?: number
          created_at?: string
          error?: string | null
          feature?: string
          id?: never
          input_tokens?: number
          key_source?: string | null
          latency_ms?: number | null
          ml_account_id?: string | null
          model?: string
          organization_id?: string | null
          output_tokens?: number
          question_id?: string | null
          reasoning_tokens?: number
          success?: boolean
          total_tokens?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_ai_key_id_fkey"
            columns: ["ai_key_id"]
            isOneToOne: false
            referencedRelation: "ai_provider_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ml_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "ml_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_events_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "ml_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_profiles: {
        Row: {
          address_number: string
          city: string
          complement: string | null
          created_at: string
          district: string
          document: string
          document_type: string
          legal_name: string
          organization_id: string
          postal_code: string
          registered_by: string | null
          state: string
          street: string
          updated_at: string
        }
        Insert: {
          address_number: string
          city: string
          complement?: string | null
          created_at?: string
          district: string
          document: string
          document_type: string
          legal_name: string
          organization_id: string
          postal_code: string
          registered_by?: string | null
          state: string
          street: string
          updated_at?: string
        }
        Update: {
          address_number?: string
          city?: string
          complement?: string | null
          created_at?: string
          district?: string
          document?: string
          document_type?: string
          legal_name?: string
          organization_id?: string
          postal_code?: string
          registered_by?: string | null
          state?: string
          street?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      item_blacklist: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          item_title: string | null
          ml_account_id: string
          organization_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          item_title?: string | null
          ml_account_id: string
          organization_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          item_title?: string | null
          ml_account_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_blacklist_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "ml_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_blacklist_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          content: string
          created_at: string | null
          id: string
          seller_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          seller_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          seller_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      listing_improvements: {
        Row: {
          created_at: string
          created_by: string | null
          done_suggestions: number[]
          id: string
          item_id: string
          item_permalink: string | null
          item_thumbnail: string | null
          item_title: string | null
          ml_account_id: string
          model: string | null
          organization_id: string
          questions_analyzed: number
          questions_from: string | null
          questions_to: string | null
          result: Json
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          done_suggestions?: number[]
          id?: string
          item_id: string
          item_permalink?: string | null
          item_thumbnail?: string | null
          item_title?: string | null
          ml_account_id: string
          model?: string | null
          organization_id: string
          questions_analyzed?: number
          questions_from?: string | null
          questions_to?: string | null
          result?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          done_suggestions?: number[]
          id?: string
          item_id?: string
          item_permalink?: string | null
          item_thumbnail?: string | null
          item_title?: string | null
          ml_account_id?: string
          model?: string | null
          organization_id?: string
          questions_analyzed?: number
          questions_from?: string | null
          questions_to?: string | null
          result?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_improvements_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "ml_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_improvements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_account_tokens: {
        Row: {
          access_token_enc: string
          expires_at: string
          ml_account_id: string
          refresh_lease_until: string | null
          refresh_token_enc: string
          updated_at: string
        }
        Insert: {
          access_token_enc: string
          expires_at: string
          ml_account_id: string
          refresh_lease_until?: string | null
          refresh_token_enc: string
          updated_at?: string
        }
        Update: {
          access_token_enc?: string
          expires_at?: string
          ml_account_id?: string
          refresh_lease_until?: string | null
          refresh_token_enc?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_account_tokens_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: true
            referencedRelation: "ml_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_accounts: {
        Row: {
          after_sale_confidence_threshold: number
          after_sale_enabled: boolean
          after_sale_instructions: string
          after_sale_sensitive_policy: string
          after_sale_signature: string
          ai_confidence_threshold: number
          answer_greeting: string
          answer_mode: string
          answer_signature: string
          answer_tone: string
          auto_reply_enabled: boolean
          connected_by: string | null
          created_at: string
          fallback_answer: string
          id: string
          last_refresh_error: string | null
          last_refresh_error_at: string | null
          ml_user_id: number
          nickname: string | null
          organization_id: string
          site_id: string | null
          status: string
          store_briefing: string
          store_profile: Json
          store_profile_completed_at: string | null
          store_setup_step: number
          token_status: string
          updated_at: string
        }
        Insert: {
          after_sale_confidence_threshold?: number
          after_sale_enabled?: boolean
          after_sale_instructions?: string
          after_sale_sensitive_policy?: string
          after_sale_signature?: string
          ai_confidence_threshold?: number
          answer_greeting?: string
          answer_mode?: string
          answer_signature?: string
          answer_tone?: string
          auto_reply_enabled?: boolean
          connected_by?: string | null
          created_at?: string
          fallback_answer?: string
          id?: string
          last_refresh_error?: string | null
          last_refresh_error_at?: string | null
          ml_user_id: number
          nickname?: string | null
          organization_id: string
          site_id?: string | null
          status?: string
          store_briefing?: string
          store_profile?: Json
          store_profile_completed_at?: string | null
          store_setup_step?: number
          token_status?: string
          updated_at?: string
        }
        Update: {
          after_sale_confidence_threshold?: number
          after_sale_enabled?: boolean
          after_sale_instructions?: string
          after_sale_sensitive_policy?: string
          after_sale_signature?: string
          ai_confidence_threshold?: number
          answer_greeting?: string
          answer_mode?: string
          answer_signature?: string
          answer_tone?: string
          auto_reply_enabled?: boolean
          connected_by?: string | null
          created_at?: string
          fallback_answer?: string
          id?: string
          last_refresh_error?: string | null
          last_refresh_error_at?: string | null
          ml_user_id?: number
          nickname?: string | null
          organization_id?: string
          site_id?: string | null
          status?: string
          store_briefing?: string
          store_profile?: Json
          store_profile_completed_at?: string | null
          store_setup_step?: number
          token_status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_conversation_messages: {
        Row: {
          attachments: Json
          conversation_id: string
          created_at: string
          id: string
          ml_message_id: string
          ml_status: string | null
          moderation_reason: string | null
          moderation_status: string | null
          organization_id: string
          sender: string
          sent_at: string
          sent_by: string | null
          source: string
          text: string
        }
        Insert: {
          attachments?: Json
          conversation_id: string
          created_at?: string
          id?: string
          ml_message_id: string
          ml_status?: string | null
          moderation_reason?: string | null
          moderation_status?: string | null
          organization_id: string
          sender: string
          sent_at: string
          sent_by?: string | null
          source: string
          text?: string
        }
        Update: {
          attachments?: Json
          conversation_id?: string
          created_at?: string
          id?: string
          ml_message_id?: string
          ml_status?: string | null
          moderation_reason?: string | null
          moderation_status?: string | null
          organization_id?: string
          sender?: string
          sent_at?: string
          sent_by?: string | null
          source?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ml_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_conversation_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_conversations: {
        Row: {
          ai_confidence: number | null
          ai_draft: string | null
          ai_model: string | null
          ai_reason: string | null
          ai_tokens: number | null
          ai_topic: string | null
          answered_at: string | null
          attempts: number
          awaiting_since: string | null
          buyer_id: number | null
          buyer_nickname: string | null
          claim_open: boolean
          created_at: string
          currency_id: string | null
          estimated_delivery_at: string | null
          id: string
          item_id: string | null
          item_permalink: string | null
          item_thumbnail: string | null
          item_title: string | null
          items_count: number
          last_answer_source: string | null
          last_error: string | null
          last_message_at: string | null
          last_message_from: string | null
          last_message_text: string | null
          locked_until: string | null
          logistic_type: string | null
          max_message_length: number
          ml_account_id: string
          ml_status: string
          ml_substatus: string | null
          next_attempt_at: string
          order_ids: string[]
          order_status: string | null
          order_summary: Json
          order_total: number | null
          ordered_at: string | null
          organization_id: string
          pack_id: string
          pending_count: number
          resync_requested: boolean
          review_reason: string | null
          shipment_id: number | null
          shipping_status: string | null
          shipping_substatus: string | null
          status: string
          synced_at: string | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_draft?: string | null
          ai_model?: string | null
          ai_reason?: string | null
          ai_tokens?: number | null
          ai_topic?: string | null
          answered_at?: string | null
          attempts?: number
          awaiting_since?: string | null
          buyer_id?: number | null
          buyer_nickname?: string | null
          claim_open?: boolean
          created_at?: string
          currency_id?: string | null
          estimated_delivery_at?: string | null
          id?: string
          item_id?: string | null
          item_permalink?: string | null
          item_thumbnail?: string | null
          item_title?: string | null
          items_count?: number
          last_answer_source?: string | null
          last_error?: string | null
          last_message_at?: string | null
          last_message_from?: string | null
          last_message_text?: string | null
          locked_until?: string | null
          logistic_type?: string | null
          max_message_length?: number
          ml_account_id: string
          ml_status?: string
          ml_substatus?: string | null
          next_attempt_at?: string
          order_ids?: string[]
          order_status?: string | null
          order_summary?: Json
          order_total?: number | null
          ordered_at?: string | null
          organization_id: string
          pack_id: string
          pending_count?: number
          resync_requested?: boolean
          review_reason?: string | null
          shipment_id?: number | null
          shipping_status?: string | null
          shipping_substatus?: string | null
          status?: string
          synced_at?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          ai_draft?: string | null
          ai_model?: string | null
          ai_reason?: string | null
          ai_tokens?: number | null
          ai_topic?: string | null
          answered_at?: string | null
          attempts?: number
          awaiting_since?: string | null
          buyer_id?: number | null
          buyer_nickname?: string | null
          claim_open?: boolean
          created_at?: string
          currency_id?: string | null
          estimated_delivery_at?: string | null
          id?: string
          item_id?: string | null
          item_permalink?: string | null
          item_thumbnail?: string | null
          item_title?: string | null
          items_count?: number
          last_answer_source?: string | null
          last_error?: string | null
          last_message_at?: string | null
          last_message_from?: string | null
          last_message_text?: string | null
          locked_until?: string | null
          logistic_type?: string | null
          max_message_length?: number
          ml_account_id?: string
          ml_status?: string
          ml_substatus?: string | null
          next_attempt_at?: string
          order_ids?: string[]
          order_status?: string | null
          order_summary?: Json
          order_total?: number | null
          ordered_at?: string | null
          organization_id?: string
          pack_id?: string
          pending_count?: number
          resync_requested?: boolean
          review_reason?: string | null
          shipment_id?: number | null
          shipping_status?: string | null
          shipping_substatus?: string | null
          status?: string
          synced_at?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_conversations_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "ml_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ml_credentials: {
        Row: {
          access_token: string
          auto_reply_enabled: boolean | null
          created_at: string | null
          expires_at: string
          id: string
          refresh_token: string
          seller_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token: string
          auto_reply_enabled?: boolean | null
          created_at?: string | null
          expires_at: string
          id?: string
          refresh_token: string
          seller_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string
          auto_reply_enabled?: boolean | null
          created_at?: string | null
          expires_at?: string
          id?: string
          refresh_token?: string
          seller_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ml_questions: {
        Row: {
          ai_confidence: number | null
          ai_draft: string | null
          ai_model: string | null
          ai_reason: string | null
          ai_tokens: number | null
          answer_source: string | null
          answer_text: string | null
          answered_at: string | null
          answered_by: string | null
          attempts: number
          buyer_id: number | null
          created_at: string
          fallback_reason: string | null
          id: string
          item_id: string | null
          item_permalink: string | null
          item_thumbnail: string | null
          item_title: string | null
          last_error: string | null
          locked_until: string | null
          ml_account_id: string
          ml_question_id: number
          next_attempt_at: string
          organization_id: string
          question_created_at: string | null
          question_text: string
          review_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_draft?: string | null
          ai_model?: string | null
          ai_reason?: string | null
          ai_tokens?: number | null
          answer_source?: string | null
          answer_text?: string | null
          answered_at?: string | null
          answered_by?: string | null
          attempts?: number
          buyer_id?: number | null
          created_at?: string
          fallback_reason?: string | null
          id?: string
          item_id?: string | null
          item_permalink?: string | null
          item_thumbnail?: string | null
          item_title?: string | null
          last_error?: string | null
          locked_until?: string | null
          ml_account_id: string
          ml_question_id: number
          next_attempt_at?: string
          organization_id: string
          question_created_at?: string | null
          question_text?: string
          review_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          ai_draft?: string | null
          ai_model?: string | null
          ai_reason?: string | null
          ai_tokens?: number | null
          answer_source?: string | null
          answer_text?: string | null
          answered_at?: string | null
          answered_by?: string | null
          attempts?: number
          buyer_id?: number | null
          created_at?: string
          fallback_reason?: string | null
          id?: string
          item_id?: string | null
          item_permalink?: string | null
          item_thumbnail?: string | null
          item_title?: string | null
          last_error?: string | null
          locked_until?: string | null
          ml_account_id?: string
          ml_question_id?: number
          next_attempt_at?: string
          organization_id?: string
          question_created_at?: string | null
          question_text?: string
          review_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ml_questions_ml_account_id_fkey"
            columns: ["ml_account_id"]
            isOneToOne: false
            referencedRelation: "ml_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ml_questions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          analytics_hourly_cost: number
          analytics_minutes_per_answer: number
          billing_cycle: string | null
          billing_exempt: boolean
          created_at: string
          current_period_end: string | null
          id: string
          ml_accounts_limit: number
          monthly_answers_limit: number | null
          monthly_price: number | null
          name: string
          plan: string | null
          subscription_status: string
          trial_ends_at: string
          updated_at: string
        }
        Insert: {
          analytics_hourly_cost?: number
          analytics_minutes_per_answer?: number
          billing_cycle?: string | null
          billing_exempt?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          ml_accounts_limit?: number
          monthly_answers_limit?: number | null
          monthly_price?: number | null
          name?: string
          plan?: string | null
          subscription_status?: string
          trial_ends_at?: string
          updated_at?: string
        }
        Update: {
          analytics_hourly_cost?: number
          analytics_minutes_per_answer?: number
          billing_cycle?: string | null
          billing_exempt?: boolean
          created_at?: string
          current_period_end?: string | null
          id?: string
          ml_accounts_limit?: number
          monthly_answers_limit?: number | null
          monthly_price?: number | null
          name?: string
          plan?: string | null
          subscription_status?: string
          trial_ends_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          ai_paused: boolean
          ai_paused_at: string | null
          ai_paused_by: string | null
          ai_paused_reason: string
          id: boolean
          monthly_fixed_costs_brl: number
          updated_at: string
          updated_by: string | null
          usd_brl_rate: number
        }
        Insert: {
          ai_paused?: boolean
          ai_paused_at?: string | null
          ai_paused_by?: string | null
          ai_paused_reason?: string
          id?: boolean
          monthly_fixed_costs_brl?: number
          updated_at?: string
          updated_by?: string | null
          usd_brl_rate?: number
        }
        Update: {
          ai_paused?: boolean
          ai_paused_at?: string | null
          ai_paused_by?: string | null
          ai_paused_reason?: string
          id?: boolean
          monthly_fixed_costs_brl?: number
          updated_at?: string
          updated_by?: string | null
          usd_brl_rate?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_platform_admin: boolean
          last_seen_at: string | null
          onboarding_completed_at: string | null
          terms_accepted_at: string | null
          terms_version: string | null
          tour_completed_at: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          created_at?: string
          full_name?: string
          id: string
          is_platform_admin?: boolean
          last_seen_at?: string | null
          onboarding_completed_at?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          tour_completed_at?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_platform_admin?: boolean
          last_seen_at?: string | null
          onboarding_completed_at?: string | null
          terms_accepted_at?: string | null
          terms_version?: string | null
          tour_completed_at?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      question_jobs: {
        Row: {
          ai_response: string | null
          created_at: string | null
          error_message: string | null
          id: string
          item_id: string
          item_title: string | null
          item_url: string | null
          question_id: string
          question_text: string
          seller_id: string
          status: string
          updated_at: string | null
        }
        Insert: {
          ai_response?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          item_id: string
          item_title?: string | null
          item_url?: string | null
          question_id: string
          question_text: string
          seller_id: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          ai_response?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          item_id?: string
          item_title?: string | null
          item_url?: string | null
          question_id?: string
          question_text?: string
          seller_id?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      training_examples: {
        Row: {
          answer_text: string
          created_at: string | null
          id: string
          item_id: string
          question_id: string
          question_text: string
          seller_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          answer_text: string
          created_at?: string | null
          id?: string
          item_id: string
          question_id: string
          question_text: string
          seller_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          answer_text?: string
          created_at?: string | null
          id?: string
          item_id?: string
          question_id?: string
          question_text?: string
          seller_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_add_ai_key: {
        Args: {
          p_activate?: boolean
          p_ciphertext: string
          p_context?: Json
          p_fingerprint: string
          p_hint: string
          p_id: string
          p_label: string
        }
        Returns: Json
      }
      admin_ai_usage: { Args: { p_from: string; p_to: string }; Returns: Json }
      admin_assert: { Args: never; Returns: undefined }
      admin_delete_ai_key: {
        Args: { p_context?: Json; p_key_id: string }
        Returns: undefined
      }
      admin_finance: { Args: never; Returns: Json }
      admin_list_ai_keys: { Args: never; Returns: Json }
      admin_list_audit: {
        Args: {
          p_action_prefix?: string
          p_limit?: number
          p_offset?: number
          p_organization_id?: string
        }
        Returns: Json
      }
      admin_list_organizations: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_plan?: string
          p_search?: string
          p_sort?: string
          p_status?: string
        }
        Returns: Json
      }
      admin_log_event: {
        Args: {
          p_action: string
          p_context?: Json
          p_details?: Json
          p_organization_id: string
          p_summary: string
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      admin_operations: { Args: never; Returns: Json }
      admin_org_rows: {
        Args: never
        Returns: {
          after_sale_on: boolean
          ai_answers_30d: number
          ai_calls_30d: number
          ai_cost_30d_usd: number
          ai_cost_month_usd: number
          ai_tokens_30d: number
          auto_reply_on: boolean
          billing_completed: boolean
          billing_exempt: boolean
          configured: boolean
          created_at: string
          current_period_end: string
          document: string
          document_type: string
          last_seen_at: string
          legal_name: string
          members: number
          ml_accounts_limit: number
          ml_active: number
          ml_ever: number
          ml_invalid: number
          ml_nicknames: string
          ml_total: number
          monthly_price: number
          name: string
          onboarded: boolean
          open_now: number
          organization_id: string
          owner_banned: boolean
          owner_email: string
          owner_email_confirmed: boolean
          owner_id: string
          owner_name: string
          owner_whatsapp: string
          plan: string
          questions_30d: number
          stage: string
          status: string
          subscription_status: string
          trial_ends_at: string
        }[]
      }
      admin_org_stage: {
        Args: {
          p_auto_reply_on: boolean
          p_billing_completed: boolean
          p_configured: boolean
          p_email_confirmed: boolean
          p_ml_total: number
          p_onboarded: boolean
        }
        Returns: string
      }
      admin_org_status: {
        Args: {
          p_billing_exempt: boolean
          p_plan: string
          p_subscription_status: string
          p_trial_ends_at: string
        }
        Returns: string
      }
      admin_organization_detail: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      admin_organization_usage: {
        Args: { p_from: string; p_organization_id: string; p_to: string }
        Returns: Json
      }
      admin_overview: { Args: never; Returns: Json }
      admin_pause_ml_account: {
        Args: { p_context?: Json; p_ml_account_id: string; p_scope: string }
        Returns: undefined
      }
      admin_record_ai_key_check: {
        Args: {
          p_context?: Json
          p_error?: string
          p_key_id: string
          p_ok: boolean
        }
        Returns: undefined
      }
      admin_set_ai_key_status: {
        Args: { p_context?: Json; p_key_id: string; p_status: string }
        Returns: Json
      }
      admin_set_organization_notes: {
        Args: { p_context?: Json; p_notes: string; p_organization_id: string }
        Returns: undefined
      }
      admin_update_organization: {
        Args: { p_changes: Json; p_context?: Json; p_organization_id: string }
        Returns: Json
      }
      admin_update_platform_settings: {
        Args: { p_changes: Json; p_context?: Json }
        Returns: Json
      }
      admin_update_profile: {
        Args: { p_changes: Json; p_context?: Json; p_user_id: string }
        Returns: Json
      }
      admin_write_audit: {
        Args: {
          p_action: string
          p_context: Json
          p_details: Json
          p_organization_id: string
          p_summary: string
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      ai_key_report_invalid: {
        Args: { p_error?: string; p_key_id: string }
        Returns: Json
      }
      ai_keys_promote_standby: {
        Args: { p_except: string; p_provider: string }
        Returns: {
          id: string
          key_hint: string
          label: string
        }[]
      }
      analytics_overview: {
        Args: {
          p_from: string
          p_ml_account_id?: string
          p_organization_id: string
          p_to: string
        }
        Returns: Json
      }
      claim_ml_conversation: {
        Args: { p_id: string; p_lock_seconds?: number }
        Returns: {
          ai_confidence: number | null
          ai_draft: string | null
          ai_model: string | null
          ai_reason: string | null
          ai_tokens: number | null
          ai_topic: string | null
          answered_at: string | null
          attempts: number
          awaiting_since: string | null
          buyer_id: number | null
          buyer_nickname: string | null
          claim_open: boolean
          created_at: string
          currency_id: string | null
          estimated_delivery_at: string | null
          id: string
          item_id: string | null
          item_permalink: string | null
          item_thumbnail: string | null
          item_title: string | null
          items_count: number
          last_answer_source: string | null
          last_error: string | null
          last_message_at: string | null
          last_message_from: string | null
          last_message_text: string | null
          locked_until: string | null
          logistic_type: string | null
          max_message_length: number
          ml_account_id: string
          ml_status: string
          ml_substatus: string | null
          next_attempt_at: string
          order_ids: string[]
          order_status: string | null
          order_summary: Json
          order_total: number | null
          ordered_at: string | null
          organization_id: string
          pack_id: string
          pending_count: number
          resync_requested: boolean
          review_reason: string | null
          shipment_id: number | null
          shipping_status: string | null
          shipping_substatus: string | null
          status: string
          synced_at: string | null
          tracking_number: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ml_conversations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_ml_question: {
        Args: { p_id: string; p_lock_seconds?: number }
        Returns: {
          ai_confidence: number | null
          ai_draft: string | null
          ai_model: string | null
          ai_reason: string | null
          ai_tokens: number | null
          answer_source: string | null
          answer_text: string | null
          answered_at: string | null
          answered_by: string | null
          attempts: number
          buyer_id: number | null
          created_at: string
          fallback_reason: string | null
          id: string
          item_id: string | null
          item_permalink: string | null
          item_thumbnail: string | null
          item_title: string | null
          last_error: string | null
          locked_until: string | null
          ml_account_id: string
          ml_question_id: number
          next_attempt_at: string
          organization_id: string
          question_created_at: string | null
          question_text: string
          review_reason: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "ml_questions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      current_user_after_sale_organization_ids: {
        Args: never
        Returns: string[]
      }
      current_user_managed_organization_ids: { Args: never; Returns: string[] }
      current_user_organization_ids: { Args: never; Returns: string[] }
      due_ml_conversations: { Args: { p_limit?: number }; Returns: string[] }
      due_ml_questions: { Args: { p_limit?: number }; Returns: string[] }
      is_org_member: { Args: { p_organization_id: string }; Returns: boolean }
      is_valid_tax_document: {
        Args: { p_document: string; p_type: string }
        Returns: boolean
      }
      listing_question_ranking: {
        Args: {
          p_from: string
          p_limit?: number
          p_ml_account_id?: string
          p_organization_id: string
        }
        Returns: {
          item_id: string
          item_permalink: string
          item_thumbnail: string
          item_title: string
          last_question_at: string
          ml_account_id: string
          open_questions: number
          questions: number
        }[]
      }
      organization_ai_answers: {
        Args: { p_from: string; p_organization_id: string; p_to: string }
        Returns: number
      }
      organization_plan_id: {
        Args: {
          p_plan: string
          p_subscription_status: string
          p_trial_ends_at: string
        }
        Returns: string
      }
      plan_includes_after_sale: { Args: { p_plan: string }; Returns: boolean }
      plan_ml_accounts_limit: { Args: { p_plan: string }; Returns: number }
      question_stats: {
        Args: {
          p_ml_account_id?: string
          p_organization_id: string
          p_since: string
        }
        Returns: {
          answered_ai: number
          answered_manual: number
          answered_outside: number
          avg_ai_seconds: number
          awaiting_review: number
          total: number
        }[]
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

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      question_jobs: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          question_id: string
          item_id: string
          seller_id: string
          question_text: string
          status: string
          ai_response: string | null
          error_message: string | null
          item_title: string | null
          item_url: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          question_id: string
          item_id: string
          seller_id: string
          question_text: string
          status?: string
          ai_response?: string | null
          error_message?: string | null
          item_title?: string | null
          item_url?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          question_id?: string
          item_id?: string
          seller_id?: string
          question_text?: string
          status?: string
          ai_response?: string | null
          error_message?: string | null
          item_title?: string | null
          item_url?: string | null
        }
      }
      knowledge_base: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          seller_id: string
          content: string
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          seller_id: string
          content: string
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          seller_id?: string
          content?: string
        }
      }
      ml_credentials: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          seller_id: string
          access_token: string
          refresh_token: string
          expires_at: string
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          seller_id: string
          access_token: string
          refresh_token: string
          expires_at: string
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          seller_id?: string
          access_token?: string
          refresh_token?: string
          expires_at?: string
        }
      }
    }
  }
}

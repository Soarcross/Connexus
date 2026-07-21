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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      about_content: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          id: string
          mission: string | null
          updated_at: string | null
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          id?: string
          mission?: string | null
          updated_at?: string | null
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          id?: string
          mission?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      chapter_applications: {
        Row: {
          applicant_email: string
          applicant_name: string
          applicant_role: string
          chapter_id: string | null
          city: string | null
          created_at: string
          id: string
          motivation: string
          rejection_reason: string | null
          school_name: string
          state: string | null
          status: string
          status_token: string
        }
        Insert: {
          applicant_email: string
          applicant_name: string
          applicant_role?: string
          chapter_id?: string | null
          city?: string | null
          created_at?: string
          id?: string
          motivation: string
          rejection_reason?: string | null
          school_name: string
          state?: string | null
          status?: string
          status_token?: string
        }
        Update: {
          applicant_email?: string
          applicant_name?: string
          applicant_role?: string
          chapter_id?: string | null
          city?: string | null
          created_at?: string
          id?: string
          motivation?: string
          rejection_reason?: string | null
          school_name?: string
          state?: string | null
          status?: string
          status_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapter_applications_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          city: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          primary_color: string | null
          school_name: string
          slug: string
          state: string | null
          status: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          primary_color?: string | null
          school_name: string
          slug: string
          state?: string | null
          status?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          school_name?: string
          slug?: string
          state?: string | null
          status?: string
        }
        Relationships: []
      }
      community_posts: {
        Row: {
          category: string
          chapter_id: string
          created_at: string | null
          deadline: string | null
          description: string
          expires_at: string | null
          field: string | null
          id: string
          image_url: string | null
          location: string | null
          organization: string | null
          qualification: string
          rejection_reason: string | null
          status: string
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          category: string
          chapter_id: string
          created_at?: string | null
          deadline?: string | null
          description: string
          expires_at?: string | null
          field?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          organization?: string | null
          qualification: string
          rejection_reason?: string | null
          status?: string
          title: string
          url?: string | null
          user_id: string
        }
        Update: {
          category?: string
          chapter_id?: string
          created_at?: string | null
          deadline?: string | null
          description?: string
          expires_at?: string | null
          field?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          organization?: string | null
          qualification?: string
          rejection_reason?: string | null
          status?: string
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          category: string
          created_at: string | null
          email: string
          id: string
          message: string
          name: string
          read: boolean | null
          resolved: boolean | null
        }
        Insert: {
          category: string
          created_at?: string | null
          email: string
          id?: string
          message: string
          name: string
          read?: boolean | null
          resolved?: boolean | null
        }
        Update: {
          category?: string
          created_at?: string | null
          email?: string
          id?: string
          message?: string
          name?: string
          read?: boolean | null
          resolved?: boolean | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          participant_1: string
          participant_2: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          participant_1: string
          participant_2: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          participant_1?: string
          participant_2?: string
        }
        Relationships: []
      }
      extension_requests: {
        Row: {
          created_at: string | null
          id: string
          post_id: string | null
          reason: string
          rejection_reason: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id?: string | null
          reason: string
          rejection_reason?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string | null
          reason?: string
          rejection_reason?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extension_requests_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extension_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          read: boolean
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          read?: boolean
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          read?: boolean
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          category: string
          chapter_id: string | null
          created_at: string
          created_by: string | null
          deadline: string | null
          description: string
          field: string | null
          id: string
          is_featured: boolean
          location: string | null
          organization: string | null
          title: string
          url: string | null
        }
        Insert: {
          category: string
          chapter_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          description: string
          field?: string | null
          id?: string
          is_featured?: boolean
          location?: string | null
          organization?: string | null
          title: string
          url?: string | null
        }
        Update: {
          category?: string
          chapter_id?: string | null
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          description?: string
          field?: string | null
          id?: string
          is_featured?: boolean
          location?: string | null
          organization?: string | null
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          logo_url: string | null
          name: string
          order_index: number | null
          website_url: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          order_index?: number | null
          website_url?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          order_index?: number | null
          website_url?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          chapter_id: string | null
          chapter_role: string
          club_roles: string[] | null
          created_at: string | null
          full_name: string
          grad_year: number | null
          id: string
          interests: string[] | null
          is_admin: boolean | null
          looking_for: string[] | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          chapter_id?: string | null
          chapter_role?: string
          club_roles?: string[] | null
          created_at?: string | null
          full_name: string
          grad_year?: number | null
          id: string
          interests?: string[] | null
          is_admin?: boolean | null
          looking_for?: string[] | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          chapter_id?: string | null
          chapter_role?: string
          club_roles?: string[] | null
          created_at?: string | null
          full_name?: string
          grad_year?: number | null
          id?: string
          interests?: string[] | null
          is_admin?: boolean | null
          looking_for?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket_key: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          hits?: number
          window_start: string
        }
        Update: {
          bucket_key?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          bio: string | null
          created_at: string | null
          id: string
          image_url: string | null
          name: string
          order_index: number | null
          role: string
        }
        Insert: {
          bio?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          name: string
          order_index?: number | null
          role: string
        }
        Update: {
          bio?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          name?: string
          order_index?: number | null
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      messages_per_day: {
        Row: {
          count: number | null
          day: string | null
        }
        Relationships: []
      }
      users_per_day: {
        Row: {
          count: number | null
          day: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_messages_per_day: {
        Args: never
        Returns: {
          count: number
          day: string
        }[]
      }
      admin_users_per_day: {
        Args: never
        Returns: {
          count: number
          day: string
        }[]
      }
      check_rate_limit: {
        Args: { p_key: string; p_max_hits: number; p_window_seconds: number }
        Returns: boolean
      }
      delete_expired_posts: { Args: never; Returns: undefined }
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

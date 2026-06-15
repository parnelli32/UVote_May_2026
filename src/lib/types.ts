export type Database = {
  public: {
    Tables: {
      legislative_bodies: {
        Row: {
          legislative_body_id: string;
          name: string;
          total_reps: number | null;
          total_districts: number | null;
          total_atlarge: number | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['legislative_bodies']['Row'], 'legislative_body_id' | 'created_at'> & {
          legislative_body_id?: string;
          created_at?: string;
        };
      };
      districts: {
        Row: {
          district_id: string;
          name: string;
          district_number: string | null;
          legislative_body_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['districts']['Row'], 'district_id' | 'created_at'> & {
          district_id?: string;
          created_at?: string;
        };
      };
      representatives: {
        Row: {
          representative_id: string;
          first_name: string;
          last_name: string;
          title: string | null;
          party: string | null;
          bio: string | null;
          district_id: string | null;
          legislative_body_id: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['representatives']['Row'], 'representative_id' | 'created_at'> & {
          representative_id?: string;
          created_at?: string;
        };
      };
      bills: {
        Row: {
          bill_id: string;
          title: string;
          summary: string | null;
          bill_text: string | null;
          introduced_date: string | null;
          status: string;
          primary_sponsor: string | null;
          primary_sponsor_id: string | null;
          legislative_body_id: string | null;
          created_at: string;
          passed_by_suspension?: boolean;
          topic?: string | null;
          bill_number?: string | null;
        };
        Insert: Omit<Database['public']['Tables']['bills']['Row'], 'bill_id' | 'created_at'> & {
          bill_id?: string;
          created_at?: string;
        };
      };
      bill_sponsors: {
        Row: {
          bill_sponsor_id: string;
          bill_id: string;
          representative_id: string;
          sponsor_type: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['bill_sponsors']['Row'], 'bill_sponsor_id' | 'created_at'> & {
          bill_sponsor_id?: string;
          created_at?: string;
        };
      };
      users: {
        Row: {
          user_id: string;
          username: string;
          email: string;
          street_address: string | null;
          district_id: string | null;
          is_admin: boolean;
          created_at: string;
          intro_seen_bodies?: string[] | null;
        };
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'created_at'> & {
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
      user_votes: {
        Row: {
          user_vote_id: string;
          bill_id: string | null;
          user_id: string | null;
          vote: string;
          explanation: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_votes']['Row'], 'user_vote_id' | 'created_at'> & {
          user_vote_id?: string;
          created_at?: string;
        };
      };
      rep_votes: {
        Row: {
          rep_vote_id: string;
          bill_id: string | null;
          representative_id: string | null;
          vote: string;
          explanation: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['rep_votes']['Row'], 'rep_vote_id' | 'created_at'> & {
          rep_vote_id?: string;
          created_at?: string;
        };
      };
      error_logs: {
        Row: {
          log_id: string;
          created_at: string;
          action: string | null;
          user_id: string | null;
          error_message: string | null;
          error_code: string | null;
          resolved: boolean;
        };
        Insert: Omit<Database['public']['Tables']['error_logs']['Row'], 'log_id' | 'created_at'> & {
          log_id?: string;
          created_at?: string;
        };
      };
    };
  };
};

export type BillPriority = {
  priority_id: string;
  user_id: string;
  bill_id: string;
  legislative_body_id: string;
  priority_type: 'endorse' | 'block';
  statement: string | null;
  created_at: string;
};

export type LegislativeBody = Database['public']['Tables']['legislative_bodies']['Row'];
export type District = Database['public']['Tables']['districts']['Row'];
export type Representative = Database['public']['Tables']['representatives']['Row'];
export type Bill = Database['public']['Tables']['bills']['Row'];
export type BillSponsor = Database['public']['Tables']['bill_sponsors']['Row'];
export type UserProfile = Database['public']['Tables']['users']['Row'];
export type UserVote = Database['public']['Tables']['user_votes']['Row'];
export type RepVote = Database['public']['Tables']['rep_votes']['Row'];
export type ErrorLog = Database['public']['Tables']['error_logs']['Row'];

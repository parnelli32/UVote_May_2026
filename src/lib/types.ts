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
          requires_committee_report: boolean;
        };
        Insert: Omit<Database['public']['Tables']['legislative_bodies']['Row'], 'legislative_body_id' | 'created_at' | 'requires_committee_report'> & {
          legislative_body_id?: string;
          created_at?: string;
          requires_committee_report?: boolean;
        };
        Update: Partial<Database['public']['Tables']['legislative_bodies']['Insert']>;
        Relationships: [];
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
        Update: Partial<Database['public']['Tables']['districts']['Insert']>;
        Relationships: [];
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
          photo_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['representatives']['Row'], 'representative_id' | 'created_at'> & {
          representative_id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['representatives']['Insert']>;
        Relationships: [];
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
          reported_from_committee_at?: string | null;
          short_description?: string | null;
          superseded_at?: string | null;
          superseded_by?: string | null;
          superseded_reason?: string | null;
          last_status_change_at?: string | null;
        };
        Insert: Omit<Database['public']['Tables']['bills']['Row'], 'bill_id' | 'created_at'> & {
          bill_id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['bills']['Insert']>;
        Relationships: [];
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
        Update: Partial<Database['public']['Tables']['bill_sponsors']['Insert']>;
        Relationships: [{
          foreignKeyName: 'bill_sponsors_bill_id_fkey';
          columns: ['bill_id'];
          isOneToOne: false;
          referencedRelation: 'bills';
          referencedColumns: ['bill_id'];
        }, {
          foreignKeyName: 'bill_sponsors_representative_id_fkey';
          columns: ['representative_id'];
          isOneToOne: false;
          referencedRelation: 'representatives';
          referencedColumns: ['representative_id'];
        }];
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
        Relationships: [{
          foreignKeyName: 'users_district_id_fkey';
          columns: ['district_id'];
          isOneToOne: false;
          referencedRelation: 'districts';
          referencedColumns: ['district_id'];
        }];
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
        Insert: Omit<Database['public']['Tables']['user_votes']['Row'], 'user_vote_id' | 'created_at' | 'explanation'> & {
          user_vote_id?: string;
          created_at?: string;
          explanation?: string | null;
        };
        Update: Partial<Database['public']['Tables']['user_votes']['Insert']>;
        Relationships: [{
          foreignKeyName: 'user_votes_bill_id_fkey';
          columns: ['bill_id'];
          isOneToOne: false;
          referencedRelation: 'bills';
          referencedColumns: ['bill_id'];
        }];
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
        Insert: Omit<Database['public']['Tables']['rep_votes']['Row'], 'rep_vote_id' | 'created_at' | 'explanation'> & {
          rep_vote_id?: string;
          created_at?: string;
          explanation?: string | null;
        };
        Update: Partial<Database['public']['Tables']['rep_votes']['Insert']>;
        Relationships: [{
          foreignKeyName: 'rep_votes_bill_id_fkey';
          columns: ['bill_id'];
          isOneToOne: false;
          referencedRelation: 'bills';
          referencedColumns: ['bill_id'];
        }, {
          foreignKeyName: 'rep_votes_representative_id_fkey';
          columns: ['representative_id'];
          isOneToOne: false;
          referencedRelation: 'representatives';
          referencedColumns: ['representative_id'];
        }];
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
        Update: Partial<Database['public']['Tables']['error_logs']['Insert']>;
        Relationships: [];
      };
      bill_priorities: {
        Row: {
          priority_id: string;
          user_id: string;
          bill_id: string;
          legislative_body_id: string;
          priority_type: string;
          statement: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['bill_priorities']['Row'], 'priority_id' | 'created_at'> & {
          priority_id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['bill_priorities']['Insert']>;
        Relationships: [{
          foreignKeyName: 'bill_priorities_bill_id_fkey';
          columns: ['bill_id'];
          isOneToOne: false;
          referencedRelation: 'bills';
          referencedColumns: ['bill_id'];
        }];
      };
      voting_blocks: {
        Row: {
          voting_block_id: string;
          name: string;
          created_by: string | null;
          join_code: string;
          visibility: 'private' | 'public';
          is_active: boolean;
          created_at: string;
          is_system: boolean;
          system_category: string | null;
          system_value: string | null;
        };
        Insert: Omit<Database['public']['Tables']['voting_blocks']['Row'], 'voting_block_id' | 'join_code' | 'is_active' | 'created_at' | 'is_system' | 'system_category' | 'system_value'> & {
          voting_block_id?: string;
          join_code?: string;
          is_active?: boolean;
          created_at?: string;
          is_system?: boolean;
          system_category?: string | null;
          system_value?: string | null;
        };
        Update: Partial<Database['public']['Tables']['voting_blocks']['Insert']>;
        Relationships: [];
      };
      voting_block_members: {
        Row: {
          voting_block_member_id: string;
          voting_block_id: string;
          user_id: string;
          is_admin: boolean;
          joined_at: string;
        };
        Insert: Omit<Database['public']['Tables']['voting_block_members']['Row'], 'voting_block_member_id' | 'is_admin' | 'joined_at'> & {
          voting_block_member_id?: string;
          is_admin?: boolean;
          joined_at?: string;
        };
        Update: Partial<Database['public']['Tables']['voting_block_members']['Insert']>;
        Relationships: [{
          foreignKeyName: 'voting_block_members_voting_block_id_fkey';
          columns: ['voting_block_id'];
          isOneToOne: false;
          referencedRelation: 'voting_blocks';
          referencedColumns: ['voting_block_id'];
        }];
      };
      user_districts: {
        Row: {
          user_district_id: string;
          user_id: string;
          legislative_body_id: string;
          district_id: string;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_districts']['Row'], 'user_district_id' | 'created_at'> & {
          user_district_id?: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_districts']['Insert']>;
        Relationships: [{
          foreignKeyName: 'user_districts_district_id_fkey';
          columns: ['district_id'];
          isOneToOne: false;
          referencedRelation: 'districts';
          referencedColumns: ['district_id'];
        }, {
          foreignKeyName: 'user_districts_legislative_body_id_fkey';
          columns: ['legislative_body_id'];
          isOneToOne: false;
          referencedRelation: 'legislative_bodies';
          referencedColumns: ['legislative_body_id'];
        }];
      };
      user_demographics: {
        Row: {
          user_id: string;
          race_ethnicity: string | null;
          hispanic_latino: boolean | null;
          education: string | null;
          annual_earnings: string | null;
          homeownership: string | null;
          age_bracket: string | null;
          employment_status: string | null;
          veteran: boolean | null;
          disability: boolean | null;
          household_type: string | null;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['user_demographics']['Row'], 'updated_at'> & {
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['user_demographics']['Insert']>;
        Relationships: [{
          foreignKeyName: 'user_demographics_user_id_fkey';
          columns: ['user_id'];
          isOneToOne: true;
          referencedRelation: 'users';
          referencedColumns: ['user_id'];
        }];
      };
    };
    Views: {
      bill_vote_tallies: {
        Row: {
          bill_id: string;
          support_count: number;
          oppose_count: number;
          total_votes: number;
        };
        Relationships: [];
      };
      voting_blocks_public: {
        Row: {
          voting_block_id: string;
          name: string;
          visibility: 'private' | 'public';
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          member_count: number;
        };
        Relationships: [];
      };
      // bills + vote tallies + the calling user's own vote/majority-match status —
      // powers the paginated, server-filtered Bills feed (HomeTab.tsx). See
      // 20260815120000_add_my_bill_feed_view_and_topic_backfill.sql.
      my_bill_feed: {
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
          passed_by_suspension: boolean | null;
          topic: string | null;
          bill_number: string | null;
          reported_from_committee_at: string | null;
          short_description: string | null;
          superseded_at: string | null;
          superseded_by: string | null;
          superseded_reason: string | null;
          support_count: number;
          oppose_count: number;
          total_votes: number;
          support_pct: number;
          effective_sort_date: string;
          my_vote: string | null;
          matched_district_majority: boolean | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      // Rep vs. their own district's (or at-large body's) vote majority.
      constituent_score: {
        Args: { p_representative_id: string };
        Returns: { score: number | null; qualifying_bills: number | null }[];
      };
      // Rep vs. all UVote users city-wide.
      city_constituent_score: {
        Args: { p_representative_id: string };
        Returns: { score: number | null; qualifying_bills: number | null }[];
      };
      // Calling user vs. their own district's majority (bills their rep also voted on),
      // scoped to one legislative body — a user can hold a separate district (and
      // separate score) per body via user_districts.
      district_score: {
        Args: { p_legislative_body_id: string };
        Returns: { score: number | null; qualifying_bills: number | null; matched_bills: number | null }[];
      };
      // Calling user vs. a given representative's votes.
      representation_score: {
        Args: { p_representative_id: string };
        Returns: { score: number | null; total: number; matched: number; mismatched: number }[];
      };
      // Per-bill district support/oppose tallies for every bill a rep voted on.
      rep_district_bill_history: {
        Args: { p_representative_id: string };
        Returns: {
          bill_id: string;
          rep_vote: string;
          district_support: number;
          district_oppose: number;
          qualifies_for_score: boolean;
          district_majority: 'support' | 'oppose' | null;
        }[];
      };
      // Per-bill support/oppose tallies among the calling user's own district,
      // scoped to one legislative body (see district_score).
      my_district_bill_tallies: {
        Args: { p_bill_ids: string[]; p_legislative_body_id: string };
        Returns: { bill_id: string; support_count: number; oppose_count: number }[];
      };
      // Point-in-polygon resolution of a lat/lng against the PA House/Senate
      // boundary tables — never exposes raw boundary geometry, only matched ids.
      resolve_user_state_districts: {
        Args: { p_lat: number; p_lng: number };
        Returns: { legislative_body_id: string; district_id: string }[];
      };
      // Total row count of user_votes (admin dashboard stat).
      user_votes_total_count: {
        Args: Record<string, never>;
        Returns: number;
      };
      // Upserts the caller's user_demographics row and joins the matching system
      // voting block for each newly-non-null category. The only path that may write
      // user_demographics or create/join a system voting block.
      submit_demographics: {
        Args: {
          p_race_ethnicity?: string | null;
          p_hispanic_latino?: boolean | null;
          p_education?: string | null;
          p_annual_earnings?: string | null;
          p_homeownership?: string | null;
          p_age_bracket?: string | null;
          p_employment_status?: string | null;
          p_veteran?: boolean | null;
          p_disability?: boolean | null;
          p_household_type?: string | null;
        };
        Returns: void;
      };
    };
  };
};

// `voting_blocks_public` view — no join_code, safe to read without being an admin.
export type VotingBlockPublic = {
  voting_block_id: string;
  name: string;
  visibility: 'private' | 'public';
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  member_count: number;
};

// Return shape of the get_voting_block_bill_positions RPC.
export type VotingBlockBillPosition = {
  bill_id: string;
  support_count: number;
  oppose_count: number;
  total_votes: number;
  vote_position: 'support' | 'oppose' | 'tied';
};

// Return shape of the get_voting_block_geo_breakdown RPC.
export type VotingBlockGeoBreakdown = {
  district_name: string | null;
  legislative_body_name: string | null;
  member_count: number;
};

// Own-row shape from voting_block_members (a user can only ever read their own row).
export type MyVotingBlockMembership = Database['public']['Tables']['voting_block_members']['Row'];

// Return shape of the get_bill_voting_block_positions RPC.
export type BillVotingBlockPosition = {
  voting_block_id: string;
  name: string;
  support_count: number;
  oppose_count: number;
  total_votes: number;
  vote_position: 'support' | 'oppose' | 'tied';
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
export type VotingBlock = Database['public']['Tables']['voting_blocks']['Row'];
export type VotingBlockMember = Database['public']['Tables']['voting_block_members']['Row'];
export type UserDemographics = Database['public']['Tables']['user_demographics']['Row'];
export type UserDistrict = Database['public']['Tables']['user_districts']['Row'];

// The 9 census categories `submit_demographics` accepts, keyed by system_category slug.
export const RACE_ETHNICITY_OPTIONS = [
  { value: 'white', label: 'White' },
  { value: 'black_african_american', label: 'Black or African American' },
  { value: 'asian', label: 'Asian' },
  { value: 'american_indian_alaska_native', label: 'American Indian or Alaska Native' },
  { value: 'native_hawaiian_pacific_islander', label: 'Native Hawaiian or Pacific Islander' },
  { value: 'two_or_more_races', label: 'Two or more races' },
] as const;

export const EDUCATION_OPTIONS = [
  { value: 'less_than_high_school', label: 'Less than high school' },
  { value: 'high_school_or_ged', label: 'High school / GED' },
  { value: 'some_college_or_associates', label: "Some college or associate's" },
  { value: 'bachelors', label: "Bachelor's" },
  { value: 'graduate_or_professional', label: 'Graduate or professional' },
] as const;

export const ANNUAL_EARNINGS_OPTIONS = [
  { value: 'under_25k', label: 'Under $25k' },
  { value: '25k_50k', label: '$25k - $50k' },
  { value: '50k_75k', label: '$50k - $75k' },
  { value: '75k_100k', label: '$75k - $100k' },
  { value: '100k_150k', label: '$100k - $150k' },
  { value: '150k_plus', label: '$150k+' },
] as const;

export const HOMEOWNERSHIP_OPTIONS = [
  { value: 'own', label: 'Own' },
  { value: 'rent', label: 'Rent' },
] as const;

export const AGE_BRACKET_OPTIONS = [
  { value: '18_24', label: '18-24' },
  { value: '25_34', label: '25-34' },
  { value: '35_44', label: '35-44' },
  { value: '45_54', label: '45-54' },
  { value: '55_64', label: '55-64' },
  { value: '65_plus', label: '65+' },
] as const;

export const EMPLOYMENT_STATUS_OPTIONS = [
  { value: 'employed', label: 'Employed' },
  { value: 'unemployed', label: 'Unemployed' },
  { value: 'not_in_labor_force', label: 'Not in labor force' },
] as const;

export const HOUSEHOLD_TYPE_OPTIONS = [
  { value: 'living_alone', label: 'Living alone' },
  { value: 'married_or_partnered', label: 'Married / partnered' },
  { value: 'family_with_children', label: 'Family with children' },
  { value: 'multigenerational', label: 'Multigenerational' },
] as const;

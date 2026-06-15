import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { UserProfile } from '../lib/types';

type AuthContextType = {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  districtName: string | null;
  districtUserIds: Set<string>;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  districtName: null,
  districtUserIds: new Set(),
  loading: true,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [districtName, setDistrictName] = useState<string | null>(null);
  const [districtUserIds, setDistrictUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  async function fetchProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*, districts(name)')
        .eq('user_id', userId)
        .maybeSingle();
      if (!error && data) {
        const { districts, ...userProfile } = data as typeof data & { districts: { name: string } | null };
        setProfile(userProfile as UserProfile);
        setDistrictName(districts?.name ?? null);
      }
    } catch {
      // Profile fetch failure shouldn't block the app
    }
  }

  async function refreshProfile() {
    if (user) {
      await fetchProfile(user.id);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        (async () => {
          await fetchProfile(session.user.id);
        })();
      } else {
        setProfile(null);
        setDistrictName(null);
        setDistrictUserIds(new Set());
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    async function fetchDistrictUsers() {
      if (!profile?.district_id) {
        setDistrictUserIds(new Set());
        return;
      }
      try {
        const { data } = await supabase
          .from('users')
          .select('user_id')
          .eq('district_id', profile.district_id);
        setDistrictUserIds(
          new Set(
            (data ?? []).map(
              (u: { user_id: string }) => u.user_id
            )
          )
        );
      } catch {
        setDistrictUserIds(new Set());
      }
    }
    fetchDistrictUsers();
  }, [profile?.district_id]);

  return (
    <AuthContext.Provider value={{ user, session, profile, districtName, districtUserIds, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

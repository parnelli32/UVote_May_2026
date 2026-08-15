import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { UserProfile, LegislativeBody } from '../lib/types';
import { PHILLY_COUNCIL_BODY_ID } from '../data/legislativeGuides';

const CURRENT_BODY_STORAGE_KEY = 'uvote_current_body_id';

// Fixed display order for the body switcher — anything not in this list
// (shouldn't happen once City Council/PA House/PA Senate are seeded) sorts last.
const BODY_ORDER = [
  'Philadelphia City Council',
  'Pennsylvania House of Representatives',
  'Pennsylvania Senate',
];

function sortBodies(bodies: LegislativeBody[]): LegislativeBody[] {
  return [...bodies].sort((a, b) => {
    const ai = BODY_ORDER.indexOf(a.name);
    const bi = BODY_ORDER.indexOf(b.name);
    return (ai === -1 ? BODY_ORDER.length : ai) - (bi === -1 ? BODY_ORDER.length : bi);
  });
}

// One entry per legislative body the user has a resolved district for —
// City Council, PA House, PA Senate — keyed by legislative_body_id.
export type DistrictInfo = { districtId: string; districtName: string };

type AuthContextType = {
  user: User | null;
  session: Session | null;
  /**
   * `district_id` on this object is derived from the currently selected
   * legislative body (via user_districts), not the raw `users.district_id`
   * column — every existing consumer that reads `profile.district_id`
   * automatically becomes body-scoped as the user switches bodies.
   */
  profile: UserProfile | null;
  /** @deprecated use currentDistrict — derived from currentBodyId, kept for existing call sites */
  districtName: string | null;
  /** @deprecated use districtUserIdsByBody.get(currentBodyId) — kept for existing call sites */
  districtUserIds: Set<string>;
  legislativeBodies: LegislativeBody[];
  currentBodyId: string;
  currentBody: LegislativeBody | null;
  currentDistrict: DistrictInfo | null;
  districtsByBody: Map<string, DistrictInfo>;
  setCurrentBodyId: (bodyId: string) => void;
  loading: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  districtName: null,
  districtUserIds: new Set(),
  legislativeBodies: [],
  currentBodyId: PHILLY_COUNCIL_BODY_ID,
  currentBody: null,
  currentDistrict: null,
  districtsByBody: new Map(),
  setCurrentBodyId: () => {},
  loading: true,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [rawProfile, setRawProfile] = useState<UserProfile | null>(null);
  const [legislativeBodies, setLegislativeBodies] = useState<LegislativeBody[]>([]);
  const [districtsByBody, setDistrictsByBody] = useState<Map<string, DistrictInfo>>(new Map());
  const [districtUserIdsByBody, setDistrictUserIdsByBody] = useState<Map<string, Set<string>>>(new Map());
  const [currentBodyId, setCurrentBodyIdState] = useState<string>(() => {
    try {
      return window.localStorage.getItem(CURRENT_BODY_STORAGE_KEY) || PHILLY_COUNCIL_BODY_ID;
    } catch {
      return PHILLY_COUNCIL_BODY_ID;
    }
  });
  const [loading, setLoading] = useState(true);

  function setCurrentBodyId(bodyId: string) {
    setCurrentBodyIdState(bodyId);
    try {
      window.localStorage.setItem(CURRENT_BODY_STORAGE_KEY, bodyId);
    } catch {
      // localStorage unavailable (private browsing, etc.) — selection just won't persist
    }
  }

  useEffect(() => {
    supabase
      .from('legislative_bodies')
      .select('*')
      .then(({ data }) => {
        if (data) setLegislativeBodies(sortBodies(data));
      });
  }, []);

  const currentBody = legislativeBodies.find((b) => b.legislative_body_id === currentBodyId) ?? null;
  const currentDistrict = districtsByBody.get(currentBodyId) ?? null;

  // profile.district_id exposed to consumers is the currently selected body's
  // district, not the raw users.district_id column (which only ever tracks
  // City Council) — see AuthContextType.profile doc comment.
  const profile: UserProfile | null = rawProfile
    ? { ...rawProfile, district_id: currentDistrict?.districtId ?? null }
    : null;
  const districtName = currentDistrict?.districtName ?? null;
  const districtUserIds = districtUserIdsByBody.get(currentBodyId) ?? new Set<string>();

  async function fetchProfile(userId: string) {
    try {
      const [profileRes, userDistrictsRes] = await Promise.all([
        supabase.from('users').select('*').eq('user_id', userId).maybeSingle(),
        supabase
          .from('user_districts')
          .select('legislative_body_id, district_id, districts(name)')
          .eq('user_id', userId),
      ]);

      if (!profileRes.error && profileRes.data) {
        setRawProfile(profileRes.data as UserProfile);
      }

      const byBody = new Map<string, DistrictInfo>();
      for (const row of userDistrictsRes.data ?? []) {
        const d = row as { legislative_body_id: string; district_id: string; districts: { name: string } | null };
        byBody.set(d.legislative_body_id, { districtId: d.district_id, districtName: d.districts?.name ?? '' });
      }
      setDistrictsByBody(byBody);
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        (async () => {
          await fetchProfile(session.user.id);
        })();
      } else {
        setRawProfile(null);
        setDistrictsByBody(new Map());
        setDistrictUserIdsByBody(new Map());
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Per-body district-majority membership — mirrors the legacy single-district
  // fetch this replaces (allow_read_user_districts has the same broad
  // authenticated-read shape as allow_read_district_assignments did on users).
  useEffect(() => {
    async function fetchDistrictUsersByBody() {
      const districtIds = Array.from(districtsByBody.values()).map((d) => d.districtId);
      if (districtIds.length === 0) {
        setDistrictUserIdsByBody(new Map());
        return;
      }
      try {
        const { data } = await supabase
          .from('user_districts')
          .select('user_id, legislative_body_id')
          .in('district_id', districtIds);
        const byBody = new Map<string, Set<string>>();
        for (const row of (data ?? []) as { user_id: string; legislative_body_id: string }[]) {
          if (!byBody.has(row.legislative_body_id)) byBody.set(row.legislative_body_id, new Set());
          byBody.get(row.legislative_body_id)!.add(row.user_id);
        }
        setDistrictUserIdsByBody(byBody);
      } catch {
        setDistrictUserIdsByBody(new Map());
      }
    }
    fetchDistrictUsersByBody();
  }, [districtsByBody]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        districtName,
        districtUserIds,
        legislativeBodies,
        currentBodyId,
        currentBody,
        currentDistrict,
        districtsByBody,
        setCurrentBodyId,
        loading,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

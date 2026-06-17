import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { logError } from '../lib/errorLogger';
import { BottomNav } from '../components/BottomNav';
import { AppHeader } from '../components/AppHeader';
import type { NavTab } from '../components/BottomNav';
import { DashboardTab } from './DashboardTab';
import { HomeTab } from './HomeTab';

type HomePageProps = {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onNavigateToBill: (billId: string) => void;
  onNavigateToRep: (repId: string) => void;
  onNavigateToProfile: () => void;
  onNavigateToAdmin: () => void;
  onNavigateToAbout: () => void;
  onNavigateToHowItWorks: () => void;
};

export function HomePage({ activeTab, onTabChange, onNavigateToBill, onNavigateToRep, onNavigateToProfile, onNavigateToAdmin, onNavigateToAbout, onNavigateToHowItWorks }: HomePageProps) {
  return (
    <div className="flex flex-col items-center overflow-hidden" style={{ background: '#F4F6F0', height: '100dvh' }}>
      <div className="w-full max-w-[600px] flex flex-col" style={{ height: '100dvh' }}>
        <AppHeader onNavigateToHowItWorks={onNavigateToHowItWorks} onNavigateToAbout={onNavigateToAbout} />

        {/* Body */}
        <main className="flex-1 overflow-y-auto scrollbar-hide" style={{ padding: 10, paddingBottom: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {activeTab === 'home' && <DashboardTab onNavigateToBill={onNavigateToBill} onNavigateToRep={onNavigateToRep} onSwitchToBills={() => onTabChange('bills')} onNavigateToHowItWorks={onNavigateToHowItWorks} />}
          {activeTab === 'bills' && <HomeTab onNavigateToBill={onNavigateToBill} onNavigateToAbout={onNavigateToAbout} />}
          {activeTab === 'myrep' && <MyRepTab onNavigateToRep={onNavigateToRep} />}
        </main>

        {/* Bottom Nav */}
        <BottomNav
          activeTab={activeTab}
          onTabChange={onTabChange}
          onNavigateToProfile={onNavigateToProfile}
          onNavigateToAdmin={onNavigateToAdmin}
        />
      </div>
    </div>
  );
}

function MyRepTab({ onNavigateToRep }: { onNavigateToRep: (repId: string) => void }) {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [repId, setRepId] = useState<string | null>(null);
  const [repName, setRepName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function findRep() {
      if (!profile?.district_id) {
        setLoading(false);
        return;
      }
      try {
        const { data, error: err } = await supabase
          .from('representatives')
          .select('representative_id, first_name, last_name')
          .eq('district_id', profile.district_id)
          .maybeSingle();
        if (err) throw err;
        if (data) {
          setRepId(data.representative_id);
          setRepName(`${data.first_name} ${data.last_name}`);
        }
      } catch (err) {
        const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
        logError({ action: 'load_rep_profile', userId: user?.id ?? null, errorMessage: msg });
        setError('Could not find your representative.');
      } finally {
        setLoading(false);
      }
    }
    findRep();
  }, [profile?.district_id, user?.id]);

  // Auto-navigate when rep is found
  useEffect(() => {
    if (repId) onNavigateToRep(repId);
  }, [repId, onNavigateToRep]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center" style={{ minHeight: '50vh' }}>
        <div className="flex gap-1.5">
          {[0, 150, 300].map((delay) => (
            <span key={delay} className="w-1.5 h-1.5 rounded-full animate-bounce"
              style={{ background: '#1B4332', animationDelay: `${delay}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !repName) {
    return (
      <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: '50vh' }}>
        <div className="flex items-center justify-center mb-4" style={{ width: 56, height: 56, borderRadius: 12, background: '#E8F0EB' }}>
          <i className="fa-solid fa-user" style={{ fontSize: 22, color: '#1B4332' }} />
        </div>
        <p style={{ fontSize: 15, fontWeight: 800, color: '#0f1724', marginBottom: 6 }}>My Representative</p>
        <p style={{ fontSize: 13, color: '#64748B', lineHeight: 1.5, maxWidth: 240 }}>
          {error ?? 'No representative found for your district.'}
        </p>
      </div>
    );
  }

  // Will auto-navigate; show brief loading state
  return (
    <div className="flex flex-col items-center justify-center" style={{ minHeight: '50vh' }}>
      <div className="flex gap-1.5">
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ background: '#1B4332', animationDelay: `${delay}ms` }} />
        ))}
      </div>
    </div>
  );
}

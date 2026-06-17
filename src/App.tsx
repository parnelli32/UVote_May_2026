import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SignInPage } from './pages/SignInPage';
import { SignUpPage } from './pages/SignUpPage';
import { HomePage } from './pages/HomePage';
import { BillDetailPage } from './pages/BillDetailPage';
import { RepProfilePage } from './pages/RepProfilePage';
import { UserProfilePage } from './pages/UserProfilePage';
import { AdminPage } from './pages/AdminPage';
import { AboutPage } from './pages/AboutPage';
import { HowItWorksPage } from './pages/HowItWorksPage';
import { RepBillHistoryPage } from './pages/RepBillHistoryPage';
import { UserVotingHistoryPage } from './pages/UserVotingHistoryPage';
import { OnboardingGuide } from './components/OnboardingGuide';
import { supabase } from './lib/supabase';
import { PHILLY_COUNCIL_BODY_ID } from './data/legislativeGuides';
import type { NavTab } from './components/BottomNav';

type AuthView = 'signin' | 'signup';

type Route =
  | { name: 'home' }
  | { name: 'bill'; billId: string }
  | { name: 'rep'; repId: string }
  | { name: 'profile' }
  | { name: 'admin' }
  | { name: 'about' }
  | { name: 'howItWorks' }
  | { name: 'repHistory'; repId: string; preloadedBills?: unknown[]; preloadedRepName?: string }
  | { name: 'userVotingHistory'; preloadedRows?: unknown[] };

function parseInitialRoute(): Route {
  const path = window.location.pathname;
  const billMatch = path.match(/^\/bill\/([^/]+)/);
  if (billMatch) return { name: 'bill', billId: billMatch[1] };
  const repMatch = path.match(/^\/rep\/([^/]+)/);
  if (repMatch) return { name: 'rep', repId: repMatch[1] };
  if (path === '/profile') return { name: 'profile' };
  if (path === '/admin') return { name: 'admin' };
  if (path === '/about') return { name: 'about' };
  if (path === '/how-it-works') return { name: 'howItWorks' };
  return { name: 'home' };
}

function AppInner() {
  const { user, loading, profile, refreshProfile } = useAuth();
  const [authView, setAuthView] = useState<AuthView>('signin');
  const [activeTab, setActiveTab] = useState<NavTab>('home');
  const [route, setRoute] = useState<Route>(parseInitialRoute);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (route.name === 'bill') {
      window.history.pushState({}, '', `/bill/${route.billId}`);
    } else if (route.name === 'rep') {
      window.history.pushState({}, '', `/rep/${route.repId}`);
    } else if (route.name === 'profile') {
      window.history.pushState({}, '', '/profile');
    } else if (route.name === 'admin') {
      window.history.pushState({}, '', '/admin');
    } else if (route.name === 'about') {
      window.history.pushState({}, '', '/about');
    } else if (route.name === 'howItWorks') {
      window.history.pushState({}, '', '/how-it-works');
    } else if (route.name === 'repHistory') {
      window.history.pushState({}, '', `/rep/${route.repId}/history`);
    } else if (route.name === 'userVotingHistory') {
      window.history.pushState({}, '', '/profile/history');
    } else {
      window.history.pushState({}, '', '/');
    }
  }, [route]);

  function navigateToBill(billId: string) {
    setRoute({ name: 'bill', billId });
  }

  function navigateToRep(repId: string) {
    setRoute({ name: 'rep', repId });
  }

  function navigateHome() {
    setRoute({ name: 'home' });
    setActiveTab('home');
  }

  function navigateToProfile() {
    if (!user) {
      setAuthView('signin');
      return;
    }
    setActiveTab('profile');
    setRoute({ name: 'profile' });
  }

  function navigateToAdmin() {
    setActiveTab('admin');
    setRoute({ name: 'admin' });
  }

  function navigateToAbout() {
    setRoute({ name: 'about' });
  }

  function navigateToHowItWorks() {
    setRoute({ name: 'howItWorks' });
  }

  function navigateToRepHistory(repId: string, bills?: unknown[], repName?: string) {
    setRoute({ name: 'repHistory', repId, preloadedBills: bills, preloadedRepName: repName });
  }

  function navigateToUserVotingHistory(rows?: unknown[]) {
    setRoute({ name: 'userVotingHistory', preloadedRows: rows });
  }

  useEffect(() => {
    if (!user || !profile) return;
    const seen = profile.intro_seen_bodies ?? [];
    if (!seen.includes(PHILLY_COUNCIL_BODY_ID)) {
      setShowOnboarding(true);
    }
  }, [user?.id, profile?.intro_seen_bodies]);

  async function handleOnboardingComplete() {
    if (user) {
      const current = profile?.intro_seen_bodies ?? [];
      if (!current.includes(PHILLY_COUNCIL_BODY_ID)) {
        await supabase
          .from('users')
          .update({
            intro_seen_bodies: [...current, PHILLY_COUNCIL_BODY_ID],
          })
          .eq('user_id', user.id);
        await refreshProfile();
      }
    }
    setShowOnboarding(false);
  }

  function handleTabChange(tab: NavTab) {
    setActiveTab(tab);
    if (tab === 'home' || tab === 'bills' || tab === 'myrep') {
      setRoute({ name: 'home' });
    }
  }

  const navProps = {
    activeTab,
    onTabChange: handleTabChange,
    onNavigateToProfile: navigateToProfile,
    onNavigateToAdmin: navigateToAdmin,
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#1B4332' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center justify-center" style={{ width: 56, height: 56, borderRadius: 14, background: 'white' }}>
            <i className="fa-solid fa-hand" style={{ fontSize: 28, color: '#1B4332' }} />
          </div>
          <span style={{ fontSize: 22, fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>UVote</span>
          <div className="flex gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0ms]" style={{ background: '#F5A623' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:150ms]" style={{ background: '#F5A623' }} />
            <span className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:300ms]" style={{ background: '#F5A623' }} />
          </div>
        </div>
      </div>
    );
  }

  // Bill detail is publicly accessible without login
  if (route.name === 'bill') {
    if (!user) {
      return (
        <BillDetailPage
          billId={route.billId}
          onBack={navigateHome}
          onNavigateToRep={navigateToRep}
          onNavigateToHowItWorks={navigateToHowItWorks}
          onNavigateToAbout={navigateToAbout}
          onSignUp={() => setAuthView('signup')}
        />
      );
    }
    return (
      <BillDetailPage
        billId={route.billId}
        onBack={navigateHome}
        onNavigateToRep={navigateToRep}
        onNavigateToHowItWorks={navigateToHowItWorks}
        onNavigateToAbout={navigateToAbout}
        navProps={navProps}
      />
    );
  }

  if (route.name === 'rep') {
    return (
      <RepProfilePage
        repId={route.repId}
        onBack={navigateHome}
        onNavigateToBill={navigateToBill}
        onNavigateToRep={navigateToRep}
        onNavigateToHowItWorks={navigateToHowItWorks}
        onNavigateToAbout={navigateToAbout}
        onNavigateToRepHistory={(bills, repName) => navigateToRepHistory(route.repId, bills, repName)}
        navProps={user ? navProps : undefined}
      />
    );
  }

  if (route.name === 'repHistory') {
    return (
      <RepBillHistoryPage
        repId={route.repId}
        onBack={() => navigateToRep(route.repId)}
        onNavigateToBill={navigateToBill}
        onNavigateToHowItWorks={navigateToHowItWorks}
        onNavigateToAbout={navigateToAbout}
        preloadedBills={route.preloadedBills}
        preloadedRepName={route.preloadedRepName}
        navProps={user ? navProps : undefined}
      />
    );
  }

  if (route.name === 'about') {
    return (
      <AboutPage
        onBack={user ? navigateHome : () => setAuthView('signin')}
        onNavigateToHowItWorks={navigateToHowItWorks}
        onNavigateToAbout={navigateToAbout}
        navProps={user ? navProps : undefined}
      />
    );
  }

  if (route.name === 'howItWorks') {
    return (
      <HowItWorksPage
        onBack={user ? navigateHome : () => setAuthView('signin')}
        onNavigateToAbout={navigateToAbout}
        navProps={user ? navProps : undefined}
      />
    );
  }

  if (!user) {
    if (authView === 'signup') {
      return <SignUpPage onSwitchToSignIn={() => setAuthView('signin')} />;
    }
    return <SignInPage onSwitchToSignUp={() => setAuthView('signup')} onNavigateToAbout={navigateToAbout} />;
  }

  if (route.name === 'admin') {
    return (
      <AdminPage
        onNavigateHome={navigateHome}
        navProps={navProps}
      />
    );
  }

  if (route.name === 'profile') {
    return (
      <UserProfilePage
        onSignIn={() => setAuthView('signin')}
        onNavigateToBill={navigateToBill}
        onNavigateToAbout={navigateToAbout}
        onNavigateToHowItWorks={navigateToHowItWorks}
        onNavigateToUserVotingHistory={navigateToUserVotingHistory}
        navProps={navProps}
      />
    );
  }

  if (route.name === 'userVotingHistory') {
    return (
      <UserVotingHistoryPage
        onBack={() => {
          setRoute({ name: 'profile' });
          setActiveTab('profile');
        }}
        onNavigateToBill={navigateToBill}
        onNavigateToHowItWorks={navigateToHowItWorks}
        onNavigateToAbout={navigateToAbout}
        preloadedRows={route.preloadedRows}
        navProps={navProps}
      />
    );
  }

  if (showOnboarding) {
    return (
      <OnboardingGuide onComplete={handleOnboardingComplete} />
    );
  }

  return (
    <HomePage
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onNavigateToBill={navigateToBill}
      onNavigateToRep={navigateToRep}
      onNavigateToProfile={navigateToProfile}
      onNavigateToAdmin={navigateToAdmin}
      onNavigateToAbout={navigateToAbout}
      onNavigateToHowItWorks={navigateToHowItWorks}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}

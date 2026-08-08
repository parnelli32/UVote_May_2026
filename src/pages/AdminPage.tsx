import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useDashboardStats, DashboardStats, Toast, Spinner } from './admin/AdminShared';
import { BottomNav } from '../components/BottomNav';
import type { NavTab } from '../components/BottomNav';
import type { Bill, District, Representative, LegislativeBody } from '../lib/types';
import { BillsTab } from './admin/BillsTab';
import { RepVotesTab } from './admin/RepVotesTab';
import { DistrictsRepsTab } from './admin/DistrictsRepsTab';
import { ErrorLogsTab } from './admin/ErrorLogsTab';
import { VotingBlocksTab } from './admin/VotingBlocksTab';

type NavProps = {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onNavigateToProfile: () => void;
  onNavigateToAdmin: () => void;
};

type AdminTab = 'bills' | 'repvotes' | 'districts' | 'votingblocks' | 'errorlogs';

type AdminPageProps = {
  onNavigateHome: () => void;
  navProps: NavProps;
};

export function AdminPage({ onNavigateHome, navProps }: AdminPageProps) {
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('bills');
  const [toast, setToast] = useState<string | null>(null);

  const { stats, reload: reloadStats } = useDashboardStats();

  const [bodies, setBodies] = useState<LegislativeBody[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [reps, setReps] = useState<Representative[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);

  useEffect(() => {
    async function check() {
      if (!user) { setChecking(false); return; }
      const { data } = await supabase.from('users').select('is_admin').eq('user_id', user.id).maybeSingle();
      if (data?.is_admin === true) {
        setAuthorized(true);
      }
      setChecking(false);
    }
    check();
  }, [user]);

  const loadBodies = useCallback(async () => {
    const { data } = await supabase.from('legislative_bodies').select('*').order('name');
    setBodies(data ?? []);
  }, []);

  const loadDistricts = useCallback(async () => {
    const { data } = await supabase.from('districts').select('*').order('name');
    setDistricts(data ?? []);
  }, []);

  const loadReps = useCallback(async () => {
    const { data } = await supabase.from('representatives').select('*').order('last_name');
    setReps(data ?? []);
  }, []);

  const loadBills = useCallback(async () => {
    const { data } = await supabase.from('bills').select('*').order('created_at', { ascending: false });
    setBills(data ?? []);
  }, []);

  useEffect(() => {
    if (!authorized) return;
    loadBodies();
    loadDistricts();
    loadReps();
    loadBills();
  }, [authorized, loadBodies, loadDistricts, loadReps, loadBills]);

  useEffect(() => {
    if (!checking && !authorized) onNavigateHome();
  }, [checking, authorized, onNavigateHome]);

  if (checking || !authorized) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F4F6F0' }}>
        <Spinner />
      </div>
    );
  }

  const TABS: { id: AdminTab; label: string }[] = [
    { id: 'bills', label: 'Bills' },
    { id: 'repvotes', label: 'Rep Votes' },
    { id: 'districts', label: 'Districts & Reps' },
    { id: 'votingblocks', label: 'Voting Blocks' },
    { id: 'errorlogs', label: 'Error Logs' },
  ];

  return (
    <div className="flex flex-col items-center overflow-hidden" style={{ background: '#F4F6F0', height: '100dvh' }}>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
      <div className="w-full max-w-[600px] flex flex-col" style={{ height: '100dvh' }}>

        {/* Top Nav */}
        <header className="flex-shrink-0 flex items-center px-3.5" style={{ background: 'white', borderBottom: '1px solid #E2E8E4', height: 54 }}>
          <button onClick={onNavigateHome}
            style={{ color: '#1B4332', background: 'none', border: 'none', padding: '4px 0', minHeight: 'unset', fontSize: 14, marginRight: 10 }}>
            <i className="fa-solid fa-arrow-left" style={{ marginRight: 5 }} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="fa-solid fa-hand" style={{ fontSize: 20, color: '#1B4332' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: '#0f1724', letterSpacing: '-0.3px', lineHeight: 1 }}>UVote</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '1.8px', textTransform: 'uppercase', color: '#94A3B8', lineHeight: 1 }}>Philadelphia</span>
            </div>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#1B4332', background: '#E8F0EB', padding: '3px 9px', borderRadius: 20 }}>
            Admin
          </span>
        </header>

        {/* Tab Bar */}
        <div className="flex-shrink-0 flex" style={{ background: 'white', borderBottom: '1px solid #E2E8E4' }}>
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1, padding: '10px 0', textAlign: 'center', fontSize: 13, fontWeight: 600,
                background: 'none', border: 'none', cursor: 'pointer',
                color: activeTab === tab.id ? '#1B4332' : '#94a3b8',
                borderBottom: activeTab === tab.id ? '2px solid #1B4332' : 'none',
              }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Content */}
        <main className="flex-1 overflow-y-auto scrollbar-hide" style={{ padding: 10, paddingBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <DashboardStats stats={stats} />

          {activeTab === 'bills' && (
            <BillsTab bodies={bodies} reps={reps} onToast={setToast} onStatsChange={reloadStats} />
          )}
          {activeTab === 'repvotes' && (
            <RepVotesTab bills={bills} reps={reps} onToast={setToast} />
          )}
          {activeTab === 'districts' && (
            <DistrictsRepsTab
              bodies={bodies}
              districts={districts}
              reps={reps}
              onDistrictsChange={loadDistricts}
              onRepsChange={loadReps}
              onToast={setToast}
            />
          )}
          {activeTab === 'votingblocks' && (
            <VotingBlocksTab onToast={setToast} />
          )}
          {activeTab === 'errorlogs' && (
            <ErrorLogsTab onStatsChange={reloadStats} />
          )}
        </main>
        <BottomNav {...navProps} />
      </div>
    </div>
  );
}

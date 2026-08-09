import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { logError } from '../lib/errorLogger';
import { useAuth } from '../context/AuthContext';
import { BottomNav } from '../components/BottomNav';
import { AppHeader } from '../components/AppHeader';
import type { NavTab } from '../components/BottomNav';
import type { Bill, UserVote, VotingBlockPublic } from '../lib/types';
import { DemographicsFields } from '../components/DemographicsFields';
import { EMPTY_DEMOGRAPHICS_ANSWERS, demographicsAnswersToRpcArgs } from '../lib/demographics';
import type { DemographicsAnswers } from '../lib/demographics';

type NavProps = {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onNavigateToProfile: () => void;
  onNavigateToAdmin: () => void;
};

type VoteHistoryRow = UserVote & {
  bills: Pick<Bill, 'title' | 'bill_number' | 'status'> | null;
  districtMajority: 'support' | 'oppose' | null;
  repVote: 'support' | 'oppose' | null;
};

type UserStats = {
  totalVotes: number;
  withMajority: number;
  districtAlignment: number | null;
  repAlignment: number | null;
};

type UserProfilePageProps = {
  onSignIn: () => void;
  onNavigateToBill: (billId: string) => void;
  onNavigateToAbout: () => void;
  onNavigateToHowItWorks: () => void;
  onNavigateToElectionCenter: () => void;
  onNavigateToUserVotingHistory: (rows: VoteHistoryRow[]) => void;
  onNavigateToVotingBlock: (blockId: string) => void;
  navProps: NavProps;
};

export function UserProfilePage({ onSignIn, onNavigateToBill, onNavigateToAbout, onNavigateToHowItWorks, onNavigateToElectionCenter, onNavigateToUserVotingHistory, onNavigateToVotingBlock, navProps }: UserProfilePageProps) {
  const { user, profile, districtName } = useAuth();

  const [myBlocks, setMyBlocks] = useState<VotingBlockPublic[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [stats, setStats] = useState<UserStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [history, setHistory] = useState<VoteHistoryRow[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [priorities, setPriorities] = useState<{
    priority_id: string;
    bill_id: string | null;
    priority_type: 'endorse' | 'block';
    statement: string | null;
    created_at: string;
    bills: { title: string; status: string } | null;
  }[]>([]);
  const [prioritiesLoading, setPrioritiesLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [demographicsAnswers, setDemographicsAnswers] = useState<DemographicsAnswers>(EMPTY_DEMOGRAPHICS_ANSWERS);
  const [demographicsLoading, setDemographicsLoading] = useState(true);
  const [demographicsSaving, setDemographicsSaving] = useState(false);
  const [demographicsError, setDemographicsError] = useState<string | null>(null);
  const [demographicsSaved, setDemographicsSaved] = useState(false);

  const initials = profile?.username
    ? profile.username.charAt(0).toUpperCase()
    : '?';

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : null;

  useEffect(() => {
    if (!user) return;
    loadStats();
    loadHistory();
    loadPriorities();
    loadMyBlocks();
    loadDemographics();
  }, [user, profile?.district_id]);

  async function loadDemographics() {
    if (!user) return;
    setDemographicsLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_demographics')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setDemographicsAnswers({
          race_ethnicity: data.race_ethnicity ?? '',
          hispanic_latino: data.hispanic_latino === null ? '' : String(data.hispanic_latino),
          education: data.education ?? '',
          annual_earnings: data.annual_earnings ?? '',
          homeownership: data.homeownership ?? '',
          age_bracket: data.age_bracket ?? '',
          employment_status: data.employment_status ?? '',
          veteran: data.veteran === null ? '' : String(data.veteran),
          disability: data.disability === null ? '' : String(data.disability),
          household_type: data.household_type ?? '',
        });
      }
    } catch (err) {
      logError({ action: 'load_user_demographics', userId: user.id, errorMessage: extractMsg(err) });
    } finally {
      setDemographicsLoading(false);
    }
  }

  async function handleSaveDemographics() {
    if (!user) return;
    setDemographicsSaving(true);
    setDemographicsError(null);
    setDemographicsSaved(false);
    try {
      const { error } = await supabase.rpc('submit_demographics', demographicsAnswersToRpcArgs(demographicsAnswers));
      if (error) throw error;
      setDemographicsSaved(true);
      setTimeout(() => setDemographicsSaved(false), 2500);
    } catch (err) {
      logError({ action: 'submit_demographics', userId: user.id, errorMessage: extractMsg(err) });
      setDemographicsError("We couldn't save that right now. Please try again.");
    } finally {
      setDemographicsSaving(false);
    }
  }

  async function loadMyBlocks() {
    if (!user) return;
    setBlocksLoading(true);
    try {
      const { data: memberships, error: membershipErr } = await supabase
        .from('voting_block_members')
        .select('voting_block_id')
        .eq('user_id', user.id);
      if (membershipErr) throw membershipErr;

      const blockIds = (memberships ?? []).map((m) => m.voting_block_id);
      if (blockIds.length === 0) {
        setMyBlocks([]);
        return;
      }

      const { data: blocks, error: blocksErr } = await supabase
        .from('voting_blocks_public')
        .select('*')
        .in('voting_block_id', blockIds);
      if (blocksErr) throw blocksErr;
      setMyBlocks((blocks ?? []) as VotingBlockPublic[]);
    } catch (err) {
      logError({ action: 'load_my_voting_blocks', userId: user.id, errorMessage: extractMsg(err) });
      setMyBlocks([]);
    } finally {
      setBlocksLoading(false);
    }
  }

  async function handleJoinBlock() {
    if (!joinCode.trim() || !user) return;
    setJoining(true);
    setJoinError(null);
    try {
      const { data: blockId, error } = await supabase.rpc('join_voting_block' as never, { p_code: joinCode.trim().toUpperCase() } as never);
      if (error) throw error;
      onNavigateToVotingBlock(blockId as unknown as string);
    } catch (err) {
      const msg = extractMsg(err);
      if (msg.includes('invalid_code')) {
        setJoinError("That code doesn't match a voting block. Double-check it and try again.");
      } else {
        logError({ action: 'join_voting_block', userId: user.id, errorMessage: msg });
        setJoinError("We couldn't join that voting block right now. Please try again.");
      }
    } finally {
      setJoining(false);
    }
  }

  async function loadStats() {
    if (!user) return;
    setStatsLoading(true);
    setStatsError(null);
    try {
      // Total votes
      const { data: allVotes, error: allVotesErr } = await supabase
        .from('user_votes')
        .select('user_vote_id, bill_id, vote')
        .eq('user_id', user.id);
      if (allVotesErr) throw allVotesErr;

      const totalVotes = allVotes?.length ?? 0;

      if (totalVotes === 0) {
        setStats({ totalVotes: 0, withMajority: 0, districtAlignment: null, repAlignment: null });
        return;
      }

      // Get district rep (for the Representation Score RPC's rep argument)
      let districtRepId: string | null = null;
      if (profile?.district_id) {
        const { data: repData } = await supabase
          .from('representatives')
          .select('representative_id')
          .eq('district_id', profile.district_id)
          .maybeSingle();
        districtRepId = repData?.representative_id ?? null;
      }

      // District Score and Representation Score — canonical SQL implementations via RPC
      const [districtRes, repRes] = await Promise.all([
        supabase.rpc('district_score'),
        districtRepId
          ? supabase.rpc('representation_score', { p_representative_id: districtRepId })
          : Promise.resolve(null),
      ]);

      if (districtRes.error) throw districtRes.error;
      if (repRes && repRes.error) throw repRes.error;

      const districtRow = districtRes.data?.[0];
      const repRow = repRes?.data?.[0];

      setStats({
        totalVotes,
        withMajority: districtRow?.matched_bills ?? 0,
        districtAlignment: districtRow?.score ?? null,
        repAlignment: repRow?.score ?? null,
      });
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
      logError({ action: 'calculate_user_stats', userId: user.id, errorMessage: msg });
      setStatsError("We couldn't load your stats right now.");
    } finally {
      setStatsLoading(false);
    }
  }

  async function loadHistory() {
    if (!user) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const { data: votes, error: votesErr } = await supabase
        .from('user_votes')
        .select('*, bills(title, bill_number, status)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (votesErr) throw votesErr;

      if (!votes || votes.length === 0) {
        setHistory([]);
        return;
      }

      const billIds = votes.map((v) => v.bill_id!).filter(Boolean);

      // District majority per bill — aggregated server-side (my own district only)
      const districtMajorityMap = new Map<string, 'support' | 'oppose' | null>();
      const { data: districtTallies } = await supabase.rpc('my_district_bill_tallies', { p_bill_ids: billIds });
      for (const t of districtTallies ?? []) {
        const total = t.support_count + t.oppose_count;
        if (total < 2 || t.support_count === t.oppose_count) {
          districtMajorityMap.set(t.bill_id, null);
        } else {
          districtMajorityMap.set(t.bill_id, t.support_count > t.oppose_count ? 'support' : 'oppose');
        }
      }

      // Rep votes per bill
      const repVoteMap = new Map<string, 'support' | 'oppose'>();
      if (profile?.district_id) {
        const { data: repData } = await supabase
          .from('representatives')
          .select('representative_id')
          .eq('district_id', profile.district_id)
          .maybeSingle();

        if (repData?.representative_id) {
          const { data: repVotes } = await supabase
            .from('rep_votes')
            .select('bill_id, vote')
            .eq('representative_id', repData.representative_id)
            .in('bill_id', billIds);

          for (const rv of repVotes ?? []) {
            if (rv.bill_id && (rv.vote === 'support' || rv.vote === 'oppose')) {
              repVoteMap.set(rv.bill_id, rv.vote);
            }
          }
        }
      }

      const enriched: VoteHistoryRow[] = votes.map((v) => ({
        ...v,
        bills: (v as typeof v & { bills: Pick<Bill, 'title' | 'bill_number' | 'status'> | null }).bills,
        districtMajority: districtMajorityMap.get(v.bill_id!) ?? null,
        repVote: repVoteMap.get(v.bill_id!) ?? null,
      }));

      setHistory(enriched);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
      logError({ action: 'load_voting_history', userId: user.id, errorMessage: msg });
      setHistoryError("We couldn't load your voting history right now.");
    } finally {
      setHistoryLoading(false);
    }
  }

  function extractMsg(err: unknown): string {
    return (err as { message?: string })?.message ??
      (err instanceof Error ? err.message : null) ??
      String(err);
  }

  async function loadPriorities() {
    if (!user) return;
    setPrioritiesLoading(true);
    const { data } = await supabase
      .from('bill_priorities')
      .select('priority_id, bill_id, priority_type, statement, created_at, bills(title, status)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setPriorities((data ?? []) as typeof priorities);
    setPrioritiesLoading(false);
  }

  async function handleRemovePriority(priorityId: string) {
    setRemovingId(priorityId);
    try {
      await supabase
        .from('bill_priorities')
        .delete()
        .eq('priority_id', priorityId);
      await loadPriorities();
    } catch (err) {
      logError({
        action: 'remove_priority',
        userId: user?.id ?? null,
        errorMessage: extractMsg(err),
      });
    } finally {
      setRemovingId(null);
    }
  }

  async function handleSignOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      onSignIn();
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? (err instanceof Error ? err.message : null) ?? String(err);
      logError({ action: 'sign_out', userId: user?.id ?? null, errorMessage: msg });
      setSignOutError('Sign out failed. Please try again.');
    }
  }

  if (!user || !profile) {
    return null;
  }

  return (
    <div className="flex flex-col items-center overflow-hidden" style={{ background: '#F4F6F0', height: '100dvh' }}>
      <div className="w-full max-w-[600px] flex flex-col" style={{ height: '100dvh' }}>
        <AppHeader onNavigateToHowItWorks={onNavigateToHowItWorks} onNavigateToAbout={onNavigateToAbout} onNavigateToElectionCenter={onNavigateToElectionCenter} />

        <div
          className="scrollbar-hide"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 10,
            paddingBottom: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
      {/* ── SECTION 1: HEADER CARD ── */}
      <div style={{
        background: '#1B4332',
        borderRadius: 12,
        padding: '16px 14px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        {/* Avatar */}
        <div style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: '#F5A623',
          color: '#7A4F00',
          fontSize: 16,
          fontWeight: 900,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {initials}
        </div>

        {/* Text stack */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <p style={{
            fontSize: 16, fontWeight: 900, color: 'white', lineHeight: 1.2, margin: 0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {profile.username}
          </p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.3, margin: 0 }}>
            {districtName ? `${districtName} · Philadelphia City Council` : 'Philadelphia City Council'}
          </p>
          {memberSince && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.3, margin: 0 }}>
              Member since {memberSince}
            </p>
          )}
        </div>
      </div>

      {/* ── SECTION 2: ALIGNMENT STATS ── */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        border: '1px solid #E2E8E4',
        overflow: 'visible',
      }}>
        {statsLoading ? (
          <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
            <div className="flex gap-1.5">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: '#1B4332', animationDelay: `${delay}ms` }}
                />
              ))}
            </div>
          </div>
        ) : statsError ? (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#F0455A', fontWeight: 600 }}>{statsError}</p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            padding: 12,
          }}>
            <StatCard
              value={stats?.totalVotes ?? 0}
              label="Bills Voted On"
              bg="#F4F6F0"
              numColor="#0f1724"
              labelColor="#64748b"
            />
            <StatCard
              value={stats?.withMajority ?? 0}
              label="With Majority"
              bg="#F4F6F0"
              numColor="#0f1724"
              labelColor="#64748b"
            />
            <StatCard
              value={stats?.repAlignment !== null ? `${stats!.repAlignment}%` : '—'}
              label="Representation Score"
              bg="#FFF3D6"
              numColor="#7A4F00"
              labelColor="#7A4F00"
            />
            <StatCard
              value={stats?.districtAlignment !== null ? `${stats!.districtAlignment}%` : '—'}
              label="District Score"
              bg="#E8F0EB"
              numColor="#1B4332"
              labelColor="#1B4332"
            />
          </div>
        )}
      </div>

      {/* ── SECTION 3: YOUR PRIORITIES ── */}
      {(() => {
        const activePriorities = priorities.filter(p => p.bills?.status === 'active');
        const activeEndorsements = activePriorities.filter(p => p.priority_type === 'endorse').length;
        const activeBlocks = activePriorities.filter(p => p.priority_type === 'block').length;
        const MAX_SLOTS = 3;
        return (
          <div style={{
            background: 'white',
            borderRadius: 12,
            border: '1px solid #E2E8E4',
            overflow: 'visible',
          }}>
            <div style={{
              padding: '12px 14px 6px',
              borderBottom: '1px solid #F4F6F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <span style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                color: '#94a3b8',
              }}>
                Your Priorities
              </span>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{
                  background: '#E8F0EB',
                  color: '#1B4332',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 10,
                  marginLeft: 4,
                }}>
                  {activeEndorsements}/{MAX_SLOTS} Endorse
                </span>
                <span style={{
                  background: '#FEF0EF',
                  color: '#c0392b',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: 10,
                  marginLeft: 4,
                }}>
                  {activeBlocks}/{MAX_SLOTS} Block
                </span>
              </div>
            </div>

            {prioritiesLoading ? (
              <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
                <div className="flex gap-1.5">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="w-1.5 h-1.5 rounded-full animate-bounce"
                      style={{ background: '#1B4332', animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              </div>
            ) : priorities.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center' }}>
                <i className="fa-solid fa-circle-check" style={{ fontSize: 22, color: '#94a3b8', display: 'block', marginBottom: 6 }} />
                <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
                  You haven't endorsed or blocked any bills yet.
                </p>
              </div>
            ) : (
              priorities.map((p, i) => {
                const isActive = p.bills?.status === 'active';
                const isRemoving = removingId === p.priority_id;
                const isLast = i === priorities.length - 1;
                const statusLabel = p.bills?.status
                  ? p.bills.status.charAt(0).toUpperCase() + p.bills.status.slice(1)
                  : null;
                return (
                  <div
                    key={p.priority_id}
                    style={{
                      padding: '11px 14px',
                      borderBottom: isLast ? 'none' : '1px solid #F4F6F0',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 10,
                          background: p.priority_type === 'endorse' ? '#E6F5EE' : '#FEF0EF',
                          color: p.priority_type === 'endorse' ? '#0e6b4a' : '#c0392b',
                        }}>
                          {p.priority_type === 'endorse' ? 'Endorsed' : 'Blocked'}
                        </span>
                        {!isActive && statusLabel && (
                          <span style={{
                            background: '#F1F5F9',
                            color: '#475569',
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '2px 7px',
                            borderRadius: 10,
                          }}>
                            {statusLabel} — (slot free)
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => p.bill_id && onNavigateToBill(p.bill_id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          textAlign: 'left',
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#0f1724',
                          lineHeight: 1.35,
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          cursor: 'pointer',
                          display: 'block',
                          minHeight: 'unset',
                        }}
                      >
                        {p.bills?.title ?? 'Untitled Bill'}
                      </button>
                      {p.statement && (
                        <p style={{
                          fontSize: 13,
                          color: '#64748b',
                          fontStyle: 'italic',
                          lineHeight: 1.5,
                          margin: 0,
                          wordBreak: 'break-word',
                        }}>
                          {p.statement}
                        </p>
                      )}
                    </div>
                    {isActive && (
                      <button
                        onClick={() => handleRemovePriority(p.priority_id)}
                        disabled={isRemoving}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: 13,
                          fontWeight: 700,
                          color: '#94a3b8',
                          textDecoration: 'underline',
                          cursor: isRemoving ? 'default' : 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        {isRemoving ? '...' : 'Remove'}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        );
      })()}

      {/* ── SECTION 3B: VOTING BLOCKS ── */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        border: '1px solid #E2E8E4',
        overflow: 'visible',
      }}>
        <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid #F4F6F0' }}>
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            color: '#94a3b8',
          }}>
            Voting Blocks
          </span>
        </div>

        {blocksLoading ? (
          <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
            <div className="flex gap-1.5">
              {[0, 150, 300].map((delay) => (
                <span key={delay} className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: '#1B4332', animationDelay: `${delay}ms` }} />
              ))}
            </div>
          </div>
        ) : myBlocks.length > 0 ? (
          myBlocks.map((b, i) => (
            <button
              key={b.voting_block_id}
              onClick={() => onNavigateToVotingBlock(b.voting_block_id)}
              style={{
                width: '100%',
                padding: '11px 14px',
                borderBottom: i < myBlocks.length - 1 ? '1px solid #F4F6F0' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', minHeight: 'unset',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f1724', display: 'block' }}>{b.name}</span>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>
                  {b.member_count} member{b.member_count === 1 ? '' : 's'}
                  {!b.is_active && ' · Inactive — tap to revive'}
                </span>
              </div>
              <i className="fa-solid fa-chevron-right" style={{ fontSize: 12, color: '#94a3b8', flexShrink: 0 }} />
            </button>
          ))
        ) : (
          <div style={{ padding: '16px 14px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
              Voting blocks let you combine your vote with a family, union, or community group's shared position on bills.
            </p>
          </div>
        )}

        <div style={{ padding: '12px 14px 14px', borderTop: myBlocks.length > 0 ? '1px solid #F4F6F0' : 'none' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={joinCode}
              onChange={(e) => { setJoinCode(e.target.value); setJoinError(null); }}
              placeholder="Have a voting block code?"
              style={{
                flex: 1, background: '#F4F6F0', border: '1px solid #E2E8E4', borderRadius: 8,
                padding: '10px 11px', fontSize: 13, color: '#0f1724', boxSizing: 'border-box',
              }}
            />
            <button
              onClick={handleJoinBlock}
              disabled={joining || !joinCode.trim()}
              style={{
                background: '#1B4332', color: 'white', border: 'none', borderRadius: 8,
                padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                opacity: joining || !joinCode.trim() ? 0.6 : 1, flexShrink: 0,
              }}
            >
              {joining ? '…' : 'Join'}
            </button>
          </div>
          {joinError && (
            <p style={{ fontSize: 13, color: '#F0455A', fontWeight: 600, marginTop: 8 }}>{joinError}</p>
          )}
        </div>
      </div>

      {/* ── SECTION 3C: DEMOGRAPHICS ── */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        border: '1px solid #E2E8E4',
        overflow: 'visible',
      }}>
        <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid #F4F6F0' }}>
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            color: '#94a3b8',
          }}>
            Demographics
          </span>
        </div>

        {demographicsLoading ? (
          <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
            <div className="flex gap-1.5">
              {[0, 150, 300].map((delay) => (
                <span key={delay} className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: '#1B4332', animationDelay: `${delay}ms` }} />
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: '12px 14px' }}>
            <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, margin: '0 0 12px' }}>
              These are always optional and never visible to anyone, including UVote admins — they only ever inform aggregate, anonymous community breakdowns.
            </p>

            <DemographicsFields answers={demographicsAnswers} onChange={setDemographicsAnswers} />

            {demographicsError && (
              <p style={{ fontSize: 13, color: '#F0455A', fontWeight: 600, marginTop: 12 }}>{demographicsError}</p>
            )}
            {demographicsSaved && (
              <p style={{ fontSize: 13, color: '#0e6b4a', fontWeight: 600, marginTop: 12 }}>Saved.</p>
            )}

            <button
              onClick={handleSaveDemographics}
              disabled={demographicsSaving}
              style={{
                width: '100%',
                marginTop: 14,
                background: '#1B4332',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                padding: 12,
                fontSize: 13,
                fontWeight: 700,
                cursor: demographicsSaving ? 'default' : 'pointer',
                opacity: demographicsSaving ? 0.7 : 1,
              }}
            >
              {demographicsSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* ── SECTION 4: VOTING HISTORY ── */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        border: '1px solid #E2E8E4',
        overflow: 'visible',
      }}>
        <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid #F4F6F0' }}>
          <span style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            color: '#94a3b8',
          }}>
            Your Votes
          </span>
        </div>

        {historyLoading ? (
          <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
            <div className="flex gap-1.5">
              {[0, 150, 300].map((delay) => (
                <span key={delay} className="w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{ background: '#1B4332', animationDelay: `${delay}ms` }} />
              ))}
            </div>
          </div>
        ) : historyError ? (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#F0455A', fontWeight: 600 }}>
              {historyError}
            </p>
          </div>
        ) : history.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <i className="fa-solid fa-check-to-slot" style={{ fontSize: 22, color: '#94a3b8', display: 'block', marginBottom: 6 }} />
            <p style={{ fontSize: 13, color: '#94a3b8', margin: 0 }}>
              You haven't voted on any bills yet.
            </p>
          </div>
        ) : (
          <>
            {history.slice(0, 3).map((row) => {
              const billTitle = row.bills?.title ?? 'Untitled Bill';
              const isSupport = row.vote === 'support';
              return (
                <div
                  key={row.user_vote_id}
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid #F4F6F0',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <button
                    onClick={() => row.bill_id && onNavigateToBill(row.bill_id)}
                    style={{
                      flex: 1,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      textAlign: 'left',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#0f1724',
                      lineHeight: 1.35,
                      cursor: 'pointer',
                      minHeight: 'unset',
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      display: 'block',
                    }}
                  >
                    {billTitle}
                  </button>
                  <span style={{
                    fontSize: 12,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 6,
                    flexShrink: 0,
                    background: isSupport ? '#E8F0EB' : '#FEF0EF',
                    color: isSupport ? '#1B4332' : '#c0392b',
                    whiteSpace: 'nowrap',
                  }}>
                    {isSupport ? 'Supported' : 'Opposed'}
                  </span>
                </div>
              );
            })}
            <div style={{ padding: '10px 14px', borderTop: '1px solid #F4F6F0' }}>
              <button
                onClick={() => onNavigateToUserVotingHistory(history)}
                style={{
                  width: '100%',
                  background: 'none',
                  border: 'none',
                  padding: '6px 0',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#1B4332',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                See my full voting record →
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── SECTION 5: ACCOUNT ── */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        border: '1px solid #E2E8E4',
        padding: 14,
      }}>
        <span style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: '#94a3b8',
          display: 'block',
          marginBottom: 4,
        }}>
          Email
        </span>
        <p style={{ fontSize: 13, color: '#0f1724', margin: 0 }}>{profile.email}</p>

        <div style={{ height: 1, background: '#F4F6F0', margin: '12px 0' }} />

        <button
          onClick={onNavigateToAbout}
          style={{
            display: 'block', fontSize: 13, color: '#1B4332', fontWeight: 700,
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            marginBottom: 12, textAlign: 'left',
          }}
        >
          About UVote
        </button>

        {signOutError && (
          <p style={{ fontSize: 13, color: '#F0455A', fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>
            {signOutError}
          </p>
        )}

        <button
          onClick={handleSignOut}
          style={{
            width: '100%',
            background: 'white',
            color: '#F0455A',
            border: '1.5px solid #F0455A',
            borderRadius: 10,
            padding: 12,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Sign Out
        </button>
        </div>
        </div>
        <BottomNav {...navProps} />
      </div>
    </div>
  );
}

function StatCard({
  value,
  label,
  bg,
  numColor,
  labelColor,
}: {
  value: number | string;
  label: string;
  bg: string;
  numColor: string;
  labelColor: string;
}) {
  return (
    <div style={{
      background: bg,
      borderRadius: 8,
      padding: 10,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
    }}>
      <span style={{ fontSize: 20, fontWeight: 900, lineHeight: 1, color: numColor }}>
        {value}
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: labelColor, marginTop: 4, lineHeight: 1.3 }}>
        {label}
      </span>
    </div>
  );
}

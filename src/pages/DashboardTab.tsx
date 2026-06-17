import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { logError } from '../lib/errorLogger';
import { useAuth } from '../context/AuthContext';
import { getTopicTag } from '../lib/billUtils';
import { SkeletonPulse, DashboardSkeleton } from '../components/DashboardSkeleton';
import { getCache, setCache, TTL } from '../lib/cache';
import type { Representative } from '../lib/types';

// ─── DASHBOARD TAB ──────────────────────────────────────────────────────────

type SpotlightBill = {
  bill_id: string;
  title: string;
  summary: string | null;
  topic: string | null;
  status: string;
  created_at: string;
  support_count: number;
  oppose_count: number;
  total_votes: number;
  userVote: 'support' | 'oppose' | null;
};

type RepActivityItem = {
  bill_id: string | null;
  vote: string;
  created_at: string;
  bills: { title: string } | null;
};

type WorthYourVoteBill = {
  bill_id: string;
  title: string;
  topic: string | null;
  total_votes: number;
  repVoted: boolean;
  contextText: string;
};

const SPOTLIGHT_VOTE_THRESHOLD = 5;

export function DashboardTab({
  onNavigateToBill,
  onNavigateToRep,
  onSwitchToBills,
  onNavigateToHowItWorks,
}: {
  onNavigateToBill: (billId: string) => void;
  onNavigateToRep: (repId: string) => void;
  onSwitchToBills: () => void;
  onNavigateToHowItWorks: () => void;
}) {
  const { user, profile, districtUserIds: cachedDistrictUserIds, districtName } = useAuth();

  const [rep, setRep] = useState<Pick<Representative, 'representative_id' | 'first_name' | 'last_name' | 'title' | 'party'> | null>(null);
  const [activeBillCount, setActiveBillCount] = useState(0);
  const [userVoteCount, setUserVoteCount] = useState(0);
  const [spotlightBills, setSpotlightBills] = useState<SpotlightBill[]>([]);
  const [repRecentVotes, setRepRecentVotes] = useState<RepActivityItem[]>([]);
  const [alignmentScore, setAlignmentScore] = useState<number | null>(null);
  const [scoreLoading, setScoreLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userDistrictAlignment, setUserDistrictAlignment] = useState<number | null>(null);
  const [userRepAlignment, setUserRepAlignment] = useState<number | null>(null);
  const [endorseSlotsUsed, setEndorseSlotsUsed] = useState(0);
  const [blockSlotsUsed, setBlockSlotsUsed] = useState(0);
  const [worthYourVoteBills, setWorthYourVoteBills] = useState<WorthYourVoteBill[]>([]);

  useEffect(() => {
    if (!profile?.district_id || !user) return;

    async function load() {
      setLoading(true);
      setError(null);

      const mainKey = `dash_main_${user!.id}`;
      type MainCache = {
        rep: typeof rep;
        activeBillCount: number;
        userVoteCount: number;
        spotlightBills: SpotlightBill[];
        repRecentVotes: RepActivityItem[];
        endorseSlotsUsed: number;
        blockSlotsUsed: number;
        worthYourVoteBills: WorthYourVoteBill[];
      };
      const mainCached = getCache<MainCache>(mainKey, TTL.SHORT);
      if (mainCached) {
        setRep(mainCached.rep);
        setActiveBillCount(mainCached.activeBillCount);
        setUserVoteCount(mainCached.userVoteCount);
        setSpotlightBills(mainCached.spotlightBills);
        setRepRecentVotes(mainCached.repRecentVotes);
        setEndorseSlotsUsed(mainCached.endorseSlotsUsed);
        setBlockSlotsUsed(mainCached.blockSlotsUsed);
        setWorthYourVoteBills(mainCached.worthYourVoteBills);
        setLoading(false);
        return;
      }

      try {
        // Sequential: get leg body ID (small table, fast)
        const { data: districtData } = await supabase
          .from('districts')
          .select('legislative_body_id')
          .eq('district_id', profile!.district_id!)
          .maybeSingle();
        const legislativeBodyId = districtData?.legislative_body_id ?? null;

        // Phase 1: all main queries in parallel
        const [repRes, activeBillCountRes, userVoteCountRes, spotlightRes, prioritySlotsRes] = await Promise.all([
          supabase.from('representatives')
            .select('representative_id, first_name, last_name, title, party')
            .eq('district_id', profile!.district_id!)
            .maybeSingle(),
          legislativeBodyId
            ? supabase.from('bills').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('legislative_body_id', legislativeBodyId)
            : Promise.resolve({ count: 0, data: null, error: null }),
          supabase.from('user_votes').select('*', { count: 'exact', head: true }).eq('user_id', user!.id),
          legislativeBodyId
            ? supabase.from('bills').select('bill_id, title, summary, topic, status, created_at').eq('status', 'active').eq('legislative_body_id', legislativeBodyId).order('created_at', { ascending: false }).limit(15)
            : Promise.resolve({ data: [], error: null }),
          legislativeBodyId
            ? supabase.from('bill_priorities').select('priority_id, priority_type, bills(status)').eq('user_id', user!.id).eq('legislative_body_id', legislativeBodyId)
            : Promise.resolve({ data: [], error: null }),
        ]);

        setRep(repRes.data ?? null);
        setActiveBillCount(activeBillCountRes.count ?? 0);
        setUserVoteCount(userVoteCountRes.count ?? 0);

        const rawSpotlight = spotlightRes.data ?? [];
        const spotlightBillIds = rawSpotlight.map((b: { bill_id: string }) => b.bill_id);
        const repId = repRes.data?.representative_id;

        // Phase 2: tallies + rep votes + user spotlight votes in parallel
        const [tallyRes, repVotesRes, userSpotlightVotesRes] = await Promise.all([
          spotlightBillIds.length > 0
            ? supabase.from('bill_vote_tallies').select('bill_id, support_count, oppose_count, total_votes').in('bill_id', spotlightBillIds)
            : Promise.resolve({ data: [] }),
          repId
            ? supabase.from('rep_votes').select('bill_id, vote, created_at, bills(title)').eq('representative_id', repId).order('created_at', { ascending: false })
            : Promise.resolve({ data: [] }),
          spotlightBillIds.length > 0
            ? supabase.from('user_votes').select('bill_id, vote').eq('user_id', user!.id).in('bill_id', spotlightBillIds)
            : Promise.resolve({ data: [] }),
        ]);

        const tallyMap = new Map<string, { support_count: number; oppose_count: number; total_votes: number }>(
          ((tallyRes.data ?? []) as { bill_id: string; support_count: number; oppose_count: number; total_votes: number }[])
            .map(t => [t.bill_id, { support_count: Number(t.support_count ?? 0), oppose_count: Number(t.oppose_count ?? 0), total_votes: Number(t.total_votes ?? 0) }])
        );

        const userVoteMap = new Map<string, 'support' | 'oppose'>(
          ((userSpotlightVotesRes.data ?? []) as { bill_id: string; vote: string }[])
            .map(v => [v.bill_id, v.vote as 'support' | 'oppose'])
        );

        const allSpotlight: SpotlightBill[] = (rawSpotlight as { bill_id: string; title: string; summary: string | null; topic: string | null; status: string; created_at: string }[])
          .map(b => ({
            ...b,
            ...(tallyMap.get(b.bill_id) ?? { support_count: 0, oppose_count: 0, total_votes: 0 }),
            userVote: userVoteMap.get(b.bill_id) ?? null,
          }))
          .sort((a, b) => b.total_votes - a.total_votes);

        setSpotlightBills(allSpotlight.slice(0, 3));
        setRepRecentVotes((repVotesRes.data ?? []) as RepActivityItem[]);

        // Priority slot counts
        const slotData = prioritySlotsRes.data ?? [];
        const usedEndorse = (slotData as { priority_type: string; bills: { status: string } | null }[]).filter(
          p => p.priority_type === 'endorse' && p.bills?.status === 'active'
        ).length;
        const usedBlock = (slotData as { priority_type: string; bills: { status: string } | null }[]).filter(
          p => p.priority_type === 'block' && p.bills?.status === 'active'
        ).length;
        setEndorseSlotsUsed(usedEndorse);
        setBlockSlotsUsed(usedBlock);

        // Build worthYourVoteBills
        const repBillIdSet = new Set(
          ((repVotesRes.data ?? []) as { bill_id: string }[]).map(rv => rv.bill_id)
        );

        const worthBills = allSpotlight
          .filter(b => !userVoteMap.has(b.bill_id))
          .sort((a, b) => {
            const aRep = repBillIdSet.has(a.bill_id) ? 1 : 0;
            const bRep = repBillIdSet.has(b.bill_id) ? 1 : 0;
            if (aRep !== bRep) return bRep - aRep;
            return b.total_votes - a.total_votes;
          })
          .slice(0, 3)
          .map(b => ({
            bill_id: b.bill_id,
            title: b.title,
            topic: b.topic,
            total_votes: b.total_votes,
            repVoted: repBillIdSet.has(b.bill_id),
            contextText: repBillIdSet.has(b.bill_id)
              ? `Vote to compare with ${repRes.data?.first_name} ${repRes.data?.last_name}`
              : b.total_votes >= 5
                ? `${b.total_votes} district members have voted`
                : 'Be among the first in your district to vote',
          }));
        setWorthYourVoteBills(worthBills);

        setCache(mainKey, {
          rep: repRes.data ?? null,
          activeBillCount: activeBillCountRes.count ?? 0,
          userVoteCount: userVoteCountRes.count ?? 0,
          spotlightBills: allSpotlight.slice(0, 3),
          repRecentVotes: (repVotesRes.data ?? []) as RepActivityItem[],
          endorseSlotsUsed: usedEndorse,
          blockSlotsUsed: usedBlock,
          worthYourVoteBills: worthBills,
        });

        setLoading(false);

      } catch (err) {
        const msg = (err as { message?: string })?.message ?? String(err);
        logError({ action: 'load_dashboard', userId: user!.id, errorMessage: msg });
        setError("We couldn't load your dashboard right now.");
        setLoading(false);
      }
    }

    load();
  }, [user?.id, profile?.district_id]);

  // Separate effect for alignment score so it re-runs once cachedDistrictUserIds is populated
  useEffect(() => {
    if (!user || repRecentVotes.length === 0 || cachedDistrictUserIds.size === 0) {
      setAlignmentScore(null);
      setScoreLoading(false);
      return;
    }

    let cancelled = false;

    async function computeScore() {
      setScoreLoading(true);
      try {
        const scoreKey = `dash_scores_${user!.id}`;
        type ScoreCache = {
          alignmentScore: number | null;
          userDistrictAlignment: number | null;
          userRepAlignment: number | null;
        };
        const scoreCached = getCache<ScoreCache>(scoreKey, TTL.SHORT);
        if (scoreCached) {
          setAlignmentScore(scoreCached.alignmentScore);
          setUserDistrictAlignment(scoreCached.userDistrictAlignment);
          setUserRepAlignment(scoreCached.userRepAlignment);
          setScoreLoading(false);
          return;
        }

        const repBillIds = repRecentVotes.map(rv => rv.bill_id).filter(Boolean) as string[];
        if (repBillIds.length === 0) {
          if (!cancelled) { setAlignmentScore(null); setScoreLoading(false); }
          return;
        }

        const { data: districtVotes } = await supabase
          .from('user_votes')
          .select('bill_id, vote, user_id')
          .in('bill_id', repBillIds)
          .in('user_id', [...cachedDistrictUserIds]);

        if (cancelled) return;

        const { data: userVotesOnRepBills } = await supabase
          .from('user_votes')
          .select('bill_id, vote')
          .eq('user_id', user!.id)
          .in('bill_id', repBillIds);

        if (cancelled) return;

        const userBillVoteMap = new Map(
          (userVotesOnRepBills ?? []).map(uv => [uv.bill_id!, uv.vote])
        );

        const repVoteMap = new Map(repRecentVotes.map(rv => [rv.bill_id, rv.vote]));

        let uDistrictMatched = 0, uDistrictQualifying = 0;
        let uRepMatched = 0, uRepQualifying = 0;

        for (const billId of repBillIds) {
          const userVote = userBillVoteMap.get(billId);
          if (!userVote) continue;

          const billVotes = (districtVotes ?? []).filter(v => v.bill_id === billId);
          const ds = billVotes.filter(v => v.vote === 'support').length;
          const dopp = billVotes.filter(v => v.vote === 'oppose').length;
          if (ds + dopp >= 2 && ds !== dopp) {
            uDistrictQualifying++;
            const maj = ds > dopp ? 'support' : 'oppose';
            if (userVote === maj) uDistrictMatched++;
          }

          const rv = repVoteMap.get(billId);
          if ((rv === 'support' || rv === 'oppose') && (userVote === 'support' || userVote === 'oppose')) {
            uRepQualifying++;
            if (userVote === rv) uRepMatched++;
          }
        }

        if (!cancelled) {
          setUserDistrictAlignment(
            uDistrictQualifying >= 1
              ? Math.round((uDistrictMatched / uDistrictQualifying) * 100)
              : null
          );
          setUserRepAlignment(
            uRepQualifying >= 1
              ? Math.round((uRepMatched / uRepQualifying) * 100)
              : null
          );
        }

        let matched = 0, qualifying = 0;

        for (const billId of repBillIds) {
          const billVotes = (districtVotes ?? []).filter(v => v.bill_id === billId);
          const ds = billVotes.filter(v => v.vote === 'support').length;
          const dopp = billVotes.filter(v => v.vote === 'oppose').length;
          if (ds + dopp < 2 || ds === dopp) continue;
          const majority = ds > dopp ? 'support' : 'oppose';
          const rv = repVoteMap.get(billId);
          if (rv !== 'support' && rv !== 'oppose') continue;
          qualifying++;
          if (rv === majority) matched++;
        }

        if (!cancelled) {
          setAlignmentScore(qualifying >= 2 ? Math.round((matched / qualifying) * 100) : null);
          setCache(scoreKey, {
            alignmentScore: qualifying >= 2 ? Math.round((matched / qualifying) * 100) : null,
            userDistrictAlignment: uDistrictQualifying >= 1 ? Math.round((uDistrictMatched / uDistrictQualifying) * 100) : null,
            userRepAlignment: uRepQualifying >= 1 ? Math.round((uRepMatched / uRepQualifying) * 100) : null,
          });
          setScoreLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = (err as { message?: string })?.message ?? String(err);
          logError({ action: 'load_dashboard_scores', userId: user!.id, errorMessage: msg });
          setAlignmentScore(null);
          setScoreLoading(false);
        }
      }
    }

    computeScore();
    return () => { cancelled = true; };
  }, [user?.id, repRecentVotes, cachedDistrictUserIds]);

  if (!profile || !user) return null;

  if (loading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center text-center" style={{ minHeight: '50vh', padding: '0 20px' }}>
        <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: 28, color: '#F0455A', marginBottom: 10 }} />
        <p style={{ fontSize: 13, fontWeight: 700, color: '#0f1724', marginBottom: 4 }}>Something went wrong</p>
        <p style={{ fontSize: 13, color: '#64748b' }}>{error}</p>
      </div>
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const displayName = profile.username || (profile.email?.split('@')[0] ?? '');
  const repInitials = rep ? `${rep.first_name.charAt(0)}${rep.last_name.charAt(0)}`.toUpperCase() : '';

  const alignDot = alignmentScore !== null
    ? alignmentScore >= 75 ? '#1DB97A' : alignmentScore >= 40 ? '#F5A623' : '#F0455A'
    : '#94a3b8';

  const voteProgressPct = activeBillCount > 0
    ? Math.min(100, Math.round((userVoteCount / activeBillCount) * 100))
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }`}</style>

      {/* ── GREETING CARD ── */}
      <div style={{ background: '#1B4332', borderRadius: 12, padding: '14px 14px 12px' }}>
        <div style={{ display: 'block', marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 900, color: 'white', lineHeight: 1.2 }}>
            {greeting}, {displayName}
          </span>
        </div>
        <div style={{ display: 'block' }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
            {districtName ?? 'Your District'}
            {' · '}
            Philadelphia City Council
          </span>
        </div>

        {userVoteCount === 0 && (
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5, margin: '8px 0' }}>
            You're among UVote's first members in your district. Your votes now help establish your district's position on active legislation.
          </p>
        )}

        <div style={{
          marginTop: 10,
          background: 'rgba(245,166,35,0.2)',
          borderRadius: 8,
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <i className="fa-solid fa-hand" style={{ fontSize: 13, color: '#F5A623', flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#F5A623' }}>
            UVote Founding Member · Philadelphia
          </span>
        </div>
      </div>

      {/* ── YOUR REPRESENTATIVE CARD ── */}
      {rep && (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'visible' }}>
          {/* Card header */}
          <div style={{ background: '#1B4332', borderRadius: '12px 12px 0 0', padding: '12px 14px' }}>
            {/* Top row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: 'rgba(255,255,255,0.45)' }}>
                Your Representative
              </span>
              <button
                onClick={() => onNavigateToRep(rep.representative_id)}
                style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', minHeight: 'unset' }}
              >
                View profile →
              </button>
            </div>

            {/* Rep row */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: '#F5A623', color: '#7A4F00',
                  fontSize: 13, fontWeight: 900, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {repInitials}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 900, color: 'white', lineHeight: 1.2, margin: 0, display: 'block' }}>
                    {rep.first_name} {rep.last_name}
                  </p>
                  {rep.title && (
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: '3px 0 0', lineHeight: 1.3, display: 'block' }}>
                      {rep.title}
                    </p>
                  )}
                </div>
              </div>

              {/* Alignment score pill */}
              {scoreLoading ? (
                <div style={{
                  background: 'rgba(255,255,255,0.1)',
                  borderRadius: 20,
                  padding: '3px 8px',
                  width: 56,
                  height: 22,
                  animation: 'pulse 1.5s ease-in-out infinite',
                  flexShrink: 0,
                }} />
              ) : alignmentScore !== null ? (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  flexShrink: 0,
                  minWidth: 56,
                }}>
                  <div style={{
                    background: 'rgba(255,255,255,0.15)',
                    borderRadius: 20,
                    padding: '3px 8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: alignDot, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 900, color: 'white' }}>{alignmentScore}%</span>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>
                    Alignment
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Recent activity rows */}
          {repRecentVotes.length === 0 ? (
            <div style={{ padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#94a3b8', display: 'inline-block', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>No votes recorded yet</span>
            </div>
          ) : (
            repRecentVotes.slice(0, 2).map((rv, i) => {
              const billTitle = (rv.bills as { title: string } | null)?.title ?? 'a bill';
              const dot = rv.vote === 'support' ? '#1DB97A' : rv.vote === 'oppose' ? '#F0455A' : '#F5A623';
              const voteLabel = rv.vote === 'support' ? 'Supported' : rv.vote === 'oppose' ? 'Opposed' : 'Voted on';
              return (
                <div key={`rv-${i}`} style={{
                  padding: '8px 12px',
                  borderBottom: i === 0 && repRecentVotes.length > 1 ? '1px solid #F4F6F0' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                    Voted{' '}
                    <span style={{ fontWeight: 700, color: rv.vote === 'support' ? '#0e6b4a' : rv.vote === 'oppose' ? '#c0392b' : '#0f1724' }}>{voteLabel}</span>
                    {' '}on{' '}
                    <span style={{ fontWeight: 700, color: '#1B4332' }}>{billTitle}</span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── CIVIC FOOTPRINT ── */}
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid #F4F6F0' }}>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8' }}>
            Civic Footprint
          </span>
        </div>

        {/* Row 1: Bills voted progress */}
        <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #F4F6F0' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f1724' }}>Bills voted on</span>
            <span>
              <span style={{ fontSize: 13, fontWeight: 900, color: '#1B4332' }}>{userVoteCount}</span>
              <span style={{ fontSize: 13, fontWeight: 400, color: '#94a3b8' }}> of {activeBillCount} active</span>
            </span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: '#E2E8E4', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#1B4332', borderRadius: 3, width: `${voteProgressPct}%` }} />
          </div>
          <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 5, lineHeight: 1.4, margin: '5px 0 0' }}>
            {alignmentScore === null && !scoreLoading
              ? 'Vote on more bills to build your district alignment score'
              : 'Your district alignment is based on bills where you and your rep both voted'}
          </p>
        </div>

        {/* Row 2: Alignment stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #F4F6F0' }}>
          {/* District Alignment */}
          <div style={{ padding: 12, borderRight: '1px solid #F4F6F0' }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              District alignment
            </span>
            {scoreLoading ? (
              <SkeletonPulse width={40} height={16} />
            ) : userDistrictAlignment === null ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <i className="fa-solid fa-lock" style={{ fontSize: 14, color: '#94a3b8' }} />
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#94a3b8', marginLeft: 5 }}>—</span>
                </div>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>Needs more votes</p>
              </>
            ) : (() => {
              const districtDot = userDistrictAlignment >= 75 ? '#1DB97A' : userDistrictAlignment >= 40 ? '#F5A623' : '#F0455A';
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: districtDot, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 20, fontWeight: 900, color: '#0f1724' }}>{userDistrictAlignment}%</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0' }}>You vs. District</p>
                </>
              );
            })()}
          </div>

          {/* Rep Alignment */}
          <div style={{ padding: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8', display: 'block', marginBottom: 6 }}>
              Rep alignment
            </span>
            {scoreLoading ? (
              <SkeletonPulse width={40} height={16} />
            ) : userRepAlignment === null ? (
              <>
                <span style={{ fontSize: 20, fontWeight: 900, color: '#94a3b8' }}>—</span>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '4px 0 0' }}>Vote on more bills</p>
              </>
            ) : (() => {
              const repAlignDot = userRepAlignment >= 75 ? '#1DB97A' : userRepAlignment >= 40 ? '#F5A623' : '#F0455A';
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: repAlignDot, display: 'inline-block', flexShrink: 0 }} />
                    <span style={{ fontSize: 20, fontWeight: 900, color: '#0f1724' }}>{userRepAlignment}%</span>
                  </div>
                  <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0' }}>You vs. {rep?.first_name} {rep?.last_name}</p>
                </>
              );
            })()}
          </div>
        </div>

        {/* Row 3: Priority slots */}
        <div style={{ padding: '10px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#94a3b8', display: 'block', marginBottom: 3 }}>
                Priority slots
              </span>
              <span style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                Endorse or block your highest-priority bills
              </span>
            </div>
            <div style={{ flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Endorse dots */}
                <div style={{ display: 'flex', gap: 3 }}>
                  {[0, 1, 2].map(idx => (
                    <span key={idx} style={{
                      width: 11, height: 11, borderRadius: '50%', display: 'inline-block',
                      background: idx < endorseSlotsUsed ? '#1DB97A' : 'white',
                      border: idx < endorseSlotsUsed ? 'none' : '1.5px solid #1DB97A',
                    }} />
                  ))}
                </div>
                {/* Divider */}
                <div style={{ width: 1, height: 14, background: '#E2E8E4' }} />
                {/* Block dots */}
                <div style={{ display: 'flex', gap: 3 }}>
                  {[0, 1, 2].map(idx => (
                    <span key={idx} style={{
                      width: 11, height: 11, borderRadius: '50%', display: 'inline-block',
                      background: idx < blockSlotsUsed ? '#F0455A' : 'white',
                      border: idx < blockSlotsUsed ? 'none' : '1.5px solid #F0455A',
                    }} />
                  ))}
                </div>
              </div>
              {/* Legend */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1DB97A', display: 'inline-block' }} />
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>Endorse {endorseSlotsUsed}/3</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#F0455A', display: 'inline-block' }} />
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>Block {blockSlotsUsed}/3</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer: How it works link */}
        <div style={{
          padding: '8px 14px 10px',
          borderTop: '1px solid #F4F6F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <button
            onClick={onNavigateToHowItWorks}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontSize: 13,
              fontWeight: 700,
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              minHeight: 'unset',
            }}
          >
            <i className="fa-solid fa-circle-info" style={{ fontSize: 13 }} />
            Learn about the legislative process
          </button>
        </div>
      </div>

      {/* ── BILLS SPOTLIGHT ── */}
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'hidden' }}>
        <div style={{
          padding: '10px 12px 6px',
          borderBottom: '1px solid #F4F6F0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: '#94a3b8' }}>
            Bills Spotlight
          </span>
          <button
            onClick={onSwitchToBills}
            style={{ fontSize: 12, fontWeight: 700, color: '#1B4332', background: 'none', border: 'none', padding: 0, cursor: 'pointer', minHeight: 'unset' }}
          >
            See all bills →
          </button>
        </div>

        {spotlightBills.length === 0 ? (
          <p style={{ fontSize: 13, color: '#94a3b8', padding: 16, textAlign: 'center', margin: 0 }}>
            No active bills right now. Check back soon.
          </p>
        ) : (
          spotlightBills.map((bill, i) => {
            const tag = getTopicTag(bill.title, bill.summary, bill.topic);
            const supportPct = bill.total_votes > 0 ? Math.round((bill.support_count / bill.total_votes) * 100) : 0;
            const opposePct = bill.total_votes > 0 ? Math.round((bill.oppose_count / bill.total_votes) * 100) : 0;
            const hasThreshold = bill.total_votes >= SPOTLIGHT_VOTE_THRESHOLD;
            const isSupport = bill.userVote === 'support';

            return (
              <div
                key={bill.bill_id}
                style={{
                  padding: '10px 12px',
                  borderBottom: i < spotlightBills.length - 1 ? '1px solid #F4F6F0' : 'none',
                  position: 'relative',
                }}
              >
                {bill.userVote && (
                  <span style={{
                    position: 'absolute', top: 10, right: 12,
                    fontSize: 11, fontWeight: 700,
                    background: isSupport ? '#E8F0EB' : '#FEF0EF',
                    color: isSupport ? '#0e6b4a' : '#c0392b',
                    padding: '2px 6px', borderRadius: 10,
                  }}>
                    You: {isSupport ? 'Supported' : 'Opposed'}
                  </span>
                )}

                <span style={{
                  display: 'inline-block',
                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
                  background: tag.bg, color: tag.color,
                  padding: '2px 6px', borderRadius: 4, marginBottom: 5,
                }}>
                  {tag.label}
                </span>

                <button
                  onClick={() => onNavigateToBill(bill.bill_id)}
                  style={{
                    display: 'block', background: 'none', border: 'none',
                    padding: 0, textAlign: 'left', width: '100%',
                    fontSize: 13, fontWeight: 700, color: '#0f1724',
                    lineHeight: 1.3, marginBottom: 6, cursor: 'pointer',
                    minHeight: 'unset', whiteSpace: 'normal', wordWrap: 'break-word',
                    paddingRight: bill.userVote ? 80 : 0,
                  }}
                >
                  {bill.title}
                </button>

                {hasThreshold ? (
                  <>
                    <div style={{ height: 5, borderRadius: 3, background: '#E2E8E4', overflow: 'hidden', display: 'flex', marginBottom: 4 }}>
                      {bill.total_votes > 0 && (
                        <>
                          <div style={{ width: `${supportPct}%`, background: '#1DB97A' }} />
                          <div style={{ width: `${opposePct}%`, background: '#F0455A' }} />
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#1DB97A' }}>{supportPct}% Support</span>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{bill.total_votes} votes</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#F0455A' }}>{opposePct}% Oppose</span>
                    </div>
                  </>
                ) : (
                  <div style={{
                    background: '#E8F0EB', borderRadius: 6, padding: '6px 10px',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <i className="fa-solid fa-hand" style={{ fontSize: 12, color: '#1B4332', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1B4332' }}>
                      Be among the first in your district to vote
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── BILLS WORTH YOUR VOTE ── */}
      {worthYourVoteBills.length > 0 && (
        <div style={{ background: 'white', borderRadius: 12, border: '1px solid #E2E8E4', overflow: 'hidden' }}>
          <div style={{
            padding: '10px 12px 6px',
            borderBottom: '1px solid #F4F6F0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.7px', color: '#94a3b8' }}>
              Bills Worth Your Vote
            </span>
            <button
              onClick={onSwitchToBills}
              style={{ fontSize: 12, fontWeight: 700, color: '#1B4332', background: 'none', border: 'none', padding: 0, cursor: 'pointer', minHeight: 'unset' }}
            >
              See all bills →
            </button>
          </div>

          {worthYourVoteBills.map((bill, i) => {
            const tag = getTopicTag(bill.title, null, bill.topic);
            return (
              <div
                key={bill.bill_id}
                style={{
                  padding: '11px 14px',
                  borderBottom: i < worthYourVoteBills.length - 1 ? '1px solid #F4F6F0' : 'none',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
                }}
              >
                {/* Left */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px',
                      background: tag.bg, color: tag.color,
                      padding: '2px 6px', borderRadius: 4,
                    }}>
                      {tag.label}
                    </span>
                    {bill.repVoted ? (
                      <span style={{ fontSize: 11, fontWeight: 700, background: '#E8F0EB', color: '#1B4332', padding: '2px 7px', borderRadius: 10 }}>
                        <i className="fa-solid fa-circle-dot" style={{ fontSize: 11, marginRight: 3 }} />
                        Rep voted
                      </span>
                    ) : bill.total_votes >= 5 ? (
                      <span style={{ fontSize: 11, fontWeight: 700, background: '#F1F5F9', color: '#475569', padding: '2px 7px', borderRadius: 10 }}>
                        {bill.total_votes} voted
                      </span>
                    ) : null}
                  </div>
                  <button
                    onClick={() => onNavigateToBill(bill.bill_id)}
                    style={{
                      background: 'none', border: 'none', padding: 0, textAlign: 'left',
                      fontSize: 13, fontWeight: 700, color: '#0f1724', lineHeight: 1.35,
                      marginBottom: 4, display: 'block', minHeight: 'unset',
                      whiteSpace: 'normal', wordWrap: 'break-word', width: '100%', cursor: 'pointer',
                    }}
                  >
                    {bill.title}
                  </button>
                  <p style={{ fontSize: 12, color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>
                    {bill.contextText}
                  </p>
                </div>
                {/* Right */}
                <div style={{ flexShrink: 0 }}>
                  <button
                    onClick={() => onNavigateToBill(bill.bill_id)}
                    style={{
                      background: '#1B4332', color: 'white', border: 'none',
                      borderRadius: 8, padding: '7px 14px',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Vote
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
